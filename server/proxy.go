package main

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

type CacheItem struct {
	Content    []byte
	Header     http.Header
	StatusCode int
	Timestamp  time.Time
}

var (
	cache      map[string]*CacheItem
	cacheMutex sync.RWMutex
)

func init() {
	cache = make(map[string]*CacheItem)
}

func proxyRequestHandler(res http.ResponseWriter, req *http.Request) {
	// Set CORS headers so the browser doesn't complain
	res.Header().Set("Access-Control-Allow-Origin", "*")
	res.Header().Set("Access-Control-Allow-Methods", "GET")
	res.Header().Set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")

	// Check to see that the client has provided a valid secret
	secret := req.URL.Query().Get("secret")
	if secret != os.Getenv("SECRET") {
		http.Error(res, "Invalid secret", http.StatusUnauthorized)
		log.Println("Invalid request attempted from source IP", req.RemoteAddr, "with path", req.URL, "- Invalid secret")
		return
	}

	// Handle pre-flight requests
	if req.Method == "OPTIONS" {
		res.WriteHeader(http.StatusOK)
		return
	}

	// Retrieve the URL from the query parameter
	url := req.URL.Query().Get("url")
	if url == "" {
		http.Error(res, "URL part is required", http.StatusBadRequest)
		log.Println("Invalid request attempted from source IP", req.RemoteAddr, "with path", req.URL, "- URL part is required")
		return
	}

	ttl := req.URL.Query().Get("ttl")
	var cacheTTL time.Duration
	if ttl != "" {
		duration, err := time.ParseDuration(ttl)
		if err != nil {
			http.Error(res, "Invalid TTL", http.StatusBadRequest)
			log.Println("Invalid request attempted from source IP", req.RemoteAddr, "with path", req.URL, "- Invalid TTL")
			return
		}
		cacheTTL = duration
	} else {
		cacheTTL = 30 * time.Second
	}

	log.Println("Request from", req.RemoteAddr, "with TTL", cacheTTL, "and path", url)

	// Check cache
	cacheMutex.RLock()
	item, found := cache[url]
	cacheMutex.RUnlock()
	if found && time.Since(item.Timestamp) < cacheTTL {
		// Serve from cache
		writeFromCache(item, res)
		return
	}

	// Create a new request using the URL
	outReq, err := http.NewRequest(req.Method, url, nil)
	if err != nil {
		http.Error(res, "Failed to create request", http.StatusInternalServerError)
		log.Println("Failed to create request:", err)
		return
	}

	// Forward headers from the incoming request to the outgoing request
	for name, values := range req.Header {
		for _, value := range values {
			outReq.Header.Add(name, value)
		}
	}

	// Create an HTTP client and forward the request
	client := &http.Client{}
	response, err := client.Do(outReq)
	if err != nil {
		http.Error(res, "Failed to forward request", http.StatusInternalServerError)
		log.Println("Failed to forward request:", err)
		return
	}
	defer response.Body.Close()

	bodyBytes, err := io.ReadAll(response.Body)
	if err != nil {
		http.Error(res, "Failed to read response body", http.StatusInternalServerError)
		log.Println("Failed to read response body:", err)
		return
	}

	// Cache the response
	cacheMutex.Lock()
	cache[url] = &CacheItem{
		Content:    bodyBytes,
		Header:     response.Header,
		StatusCode: response.StatusCode,
		Timestamp:  time.Now(),
	}
	cacheMutex.Unlock()

	// Write response
	writeResponse(bodyBytes, response.Header, response.StatusCode, res)
}

func writeFromCache(item *CacheItem, res http.ResponseWriter) {
	writeResponse(item.Content, item.Header, item.StatusCode, res)
}

func writeResponse(content []byte, header http.Header, statusCode int, res http.ResponseWriter) {
	for key, values := range header {
		for _, value := range values {
			res.Header().Add(key, value)
		}
	}
	res.WriteHeader(statusCode)
	io.Copy(res, bytes.NewReader(content))
}

func main() {
	if len(os.Getenv("SECRET")) == 0 {
		log.Fatal("You have to set a SECRET environment variable to use this proxy. For example:\n$ SECRET=somesecret go run calendarProxy.go")
	}
	log.Println("Using secret", os.Getenv("SECRET"))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
		log.Println("No PORT environment variable detected. Defaulting to" + port)
	}

	// Start the server on port 8080
	http.HandleFunc("/", proxyRequestHandler)
	log.Println("Serving on http://localhost:" + port + "...")
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
