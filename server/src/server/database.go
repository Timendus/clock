// Models "register" themselves using
// `server.RegisterModel[ModelStruct]("table_name")`. Struct fields map to
// columns via `db:"column_name"` struct tags or snake_case of field name.

package server

import (
	"database/sql"
	"fmt"
	"log"
	"reflect"
	"strings"
	"unicode"
)

type fieldInfo struct {
	index []int // reflect index path
	name  string
}

type modelInfo struct {
	table  string
	fields map[string]fieldInfo // maps database column name to struct field
}

var (
	models = map[reflect.Type]*modelInfo{}
	frozen = false
)

/* Init code */

func RegisterModel[T any](table string) {
	if frozen {
		log.Fatal("Attempted to register a new model after freeze")
	}
	log.Println("Registering model for table", table)
	var model T
	t := reflect.TypeOf(model)
	mi := &modelInfo{
		table:  table,
		fields: buildFieldMap(t),
	}
	models[t] = mi
}

func FreezeModels() {
	frozen = true
}

/* Usage code */

// Get a model and require it to be the only result of the query
func QueryUniqueModel[T any](query string, args ...any) (*T, error) {
	models, err := QueryModels[T](query, args...)
	if len(models) < 1 {
		return nil, sql.ErrNoRows
	}
	if len(models) > 1 {
		return nil, fmt.Errorf("ambiguous query; got %v results for call to QueryModel (expected one)", len(models))
	}
	return models[0], err
}

// Get first row that satisfies the query
func QueryModel[T any](query string, args ...any) (*T, error) {
	models, err := QueryModels[T](query, args...)
	if len(models) < 1 {
		return nil, sql.ErrNoRows
	}
	return models[0], err
}

// Get all rows that satisfy the query
func QueryModels[T any](query string, args ...any) ([]*T, error) {
	if !frozen {
		log.Fatal("Attempted to query a model before freeze")
	}
	rows, err := server.database.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	out := make([]*T, 0, 16)
	for rows.Next() {
		t, scanDests, err := newInstanceAndDests[T](cols)
		if err != nil {
			return nil, err
		}
		if err := rows.Scan(scanDests...); err != nil {
			return nil, err
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		out = append(out, t)
	}

	return out, nil
}

// ----------------------------
// Internals
// ----------------------------

func newInstance[T any]() *T {
	var instance T
	return &instance
}

func scanDestinations[T any](instance *T, columns []string) []any {
	dests := make([]any, len(columns))
	for i, col := range columns {
		norm := normalizeColumn(col)
		field, ok := models[reflect.TypeOf(*instance)].fields[norm]
		if !ok {
			var discard any
			dests[i] = &discard
			continue
		}
		f := reflect.Indirect(reflect.ValueOf(instance)).FieldByName(field.name)
		if f.Kind() == reflect.Ptr {
			if f.IsNil() {
				f.Set(reflect.New(f.Type().Elem()))
			}
			dests[i] = f.Interface() // already a pointer type (e.g., *time.Time, *int)
		} else {
			dests[i] = f.Addr().Interface() // pointer to concrete value
		}
	}
	return dests
}

func findFields[T any]() map[string]fieldInfo {
	fields := map[string]fieldInfo{}
	var instance T
	instanceType := reflect.TypeOf(instance)
	for i := 0; i < instanceType.NumField(); i++ {
		field := instanceType.Field(i)
		// If a field has a package path, it is not exported (lower case) and we
		// ignore it as it's probably for internal use anyway since no other
		// part of the application can read it.
		if field.PkgPath != "" {
			continue
		}
		columnName := field.Tag.Get("db")
		if columnName == "" {
			columnName = snakeCase(field.Name)
		}
		fields[columnName] = fieldInfo{name: field.Name}
	}
	return fields
}

// newInstanceAndDests creates a new *T, aligns DB columns to struct fields, and returns Scan destinations.
func newInstanceAndDests[T any](columns []string) (*T, []any, error) {
	var v T
	modelType := reflect.TypeOf(v)
	mi := models[modelType]

	// instance of T
	ptr := reflect.New(modelType) // *T
	val := ptr.Elem()             // T

	dests := make([]any, len(columns))

	for i, col := range columns {
		norm := normalizeColumn(col)
		fi, ok := mi.fields[norm]
		if !ok {
			// Unknown column => scan into throwaway
			var discard any
			dests[i] = &discard
			continue
		}
		f := val.FieldByIndex(fi.index)
		if !f.CanAddr() {
			var discard any
			dests[i] = &discard
			continue
		}
		// If the field is a pointer, ensure it is non-nil so Scan can write into it.
		if f.Kind() == reflect.Ptr {
			if f.IsNil() {
				f.Set(reflect.New(f.Type().Elem()))
			}
			dests[i] = f.Interface() // already a pointer type (e.g., *time.Time, *int)
		} else {
			dests[i] = f.Addr().Interface() // pointer to concrete value
		}
	}

	// Return *T and scan dests
	out, ok := ptr.Interface().(*T)
	if !ok {
		return nil, nil, fmt.Errorf("miniorm: internal type assertion failed for %v", modelType)
	}
	return out, dests, nil
}

// buildFieldMap walks exported fields (including anonymous embedded structs) and creates a column->field index map.
func buildFieldMap(t reflect.Type) map[string]fieldInfo {
	fields := map[string]fieldInfo{}
	var walk func(reflect.Type, []int)
	walk = func(tt reflect.Type, path []int) {
		// Only structs
		if tt.Kind() != reflect.Struct {
			return
		}
		n := tt.NumField()
		for i := 0; i < n; i++ {
			sf := tt.Field(i)
			// Skip unexported (PkgPath != "" means unexported in reflect for Go)
			if sf.PkgPath != "" {
				continue
			}
			tag := sf.Tag.Get("db")
			if tag == "-" {
				continue
			}

			idxPath := append(append([]int{}, path...), i)

			if sf.Anonymous && tag == "" && sf.Type.Kind() == reflect.Struct {
				// Inline embedded struct
				walk(sf.Type, idxPath)
				continue
			}

			col := tag
			if col == "" {
				col = snakeCase(sf.Name)
			}
			col = strings.ToLower(col)
			fields[col] = fieldInfo{index: idxPath}
		}
	}
	walk(t, nil)
	return fields
}

// normalizeColumn lowers case and strips optional qualifiers like "table.", quotes, or backticks.
func normalizeColumn(c string) string {
	c = strings.TrimSpace(c)
	// Strip quotes/backticks/brackets commonly returned in some drivers
	c = strings.Trim(c, "`\"[]")
	// Keep only the last segment after a dot (users.id => id)
	if dot := strings.LastIndexByte(c, '.'); dot >= 0 {
		c = c[dot+1:]
	}
	return strings.ToLower(c)
}

// Convert CamelCase struct field names to snake_case table column names
func snakeCase(s string) string {
	runes := []rune(s)
	var b strings.Builder
	for i := 0; i < len(runes); i++ {
		if i > 0 && unicode.IsLower(runes[i-1]) && unicode.IsUpper(runes[i]) {
			b.WriteByte('_')
		}
		b.WriteRune(unicode.ToLower(runes[i]))
	}
	return b.String()
}
