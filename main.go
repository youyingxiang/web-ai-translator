package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"
)

// ==================== 类型定义 ====================

// AIModelConfig 存储AI模型配置
type AIModelConfig struct {
	Type       string `json:"type"`
	APIKey     string `json:"apiKey"`
	APIURL     string `json:"apiUrl"`
	ModelName  string `json:"modelName"`
	SystemMsg  string `json:"systemMsg"`
}

// TranslationRequest 通用请求结构
type TranslationRequest struct {
	Text      string `json:"text"`
	ModelType string `json:"modelType"`
	APIKey    string `json:"apiKey"`
	APIURL    string `json:"apiUrl"`
	ModelName string `json:"modelName"`
	SystemMsg string `json:"systemMsg"`
}

// ChatMessage 表示聊天消息格式
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// AppConfig 应用程序配置
type AppConfig struct {
	MaxRequestBodySize int64         // 请求体最大大小 (bytes)
	RequestTimeout     time.Duration // 请求超时时间
	Port               int           // 服务端口
}

// ServerStatus 服务器状态信息
type ServerStatus struct {
	Status        string    `json:"status"`
	Uptime        string    `json:"uptime"`
	StartTime     time.Time `json:"startTime"`
	GoVersion     string    `json:"goVersion"`
	NumGoroutines int       `json:"numGoroutines"`
	MemStats      MemStats  `json:"memStats"`
}

// MemStats 内存统计信息
type MemStats struct {
	Alloc      string `json:"alloc"`      // 当前分配的内存
	TotalAlloc string `json:"totalAlloc"` // 累计分配的内存
	Sys        string `json:"sys"`        // 从系统获取的内存
	NumGC      uint32 `json:"numGC"`      // GC次数
}

// ==================== 全局变量 ====================

// 服务启动时间
var serverStartTime = time.Now()

// ==================== 主函数 ====================

func main() {
	// 设置日志输出
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	
	// 应用配置
	config := AppConfig{
		MaxRequestBodySize: 1024 * 1024, // 1MB
		RequestTimeout:     30 * time.Second,
		Port:               8080,
	}
	
	// 从环境变量读取端口（如果有）
	port := config.Port

	// 创建路由器并设置处理函数
	router := setupRoutes(config)

	// 创建带有超时设置的服务器
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout:  60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// 设置优雅关闭
	setupGracefulShutdown(server)

	// 启动服务器
	log.Printf("翻译服务运行在 http://localhost:%d\n", port)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("服务器启动失败: %v", err)
	}
}

// ==================== 服务器设置函数 ====================

// setupRoutes 设置HTTP路由
func setupRoutes(config AppConfig) *http.ServeMux {
	router := http.NewServeMux()
	
	// 翻译API路由
	translateHandler := createTranslateHandler(config)
	router.Handle("/api/v1/translate", corsMiddleware(loggingMiddleware(translateHandler)))
	
	// 首页路由
	router.HandleFunc("/", homePageHandler)
	
	return router
}

// setupGracefulShutdown 设置优雅关闭服务器的处理
func setupGracefulShutdown(server *http.Server) {
	go func() {
		// 等待中断信号
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt)
		<-sigint

		// 收到中断信号后，创建一个5秒的关闭超时
		log.Println("收到关闭信号，正在优雅关闭服务器...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		// 关闭连接
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("服务器关闭过程中发生错误: %v", err)
		}
	}()
}

// ==================== HTTP处理函数 ====================

// homePageHandler 首页处理函数
func homePageHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `
	<!DOCTYPE html>
	<html>
	<head>
		<meta charset="UTF-8">
		<title>AI翻译服务</title>
	</head>
	<body>
		<h1>AI翻译服务 服务正在运行中!</h1>
	</body>
	</html>
	`)
}

// createTranslateHandler 创建翻译处理程序
func createTranslateHandler(config AppConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "仅支持POST请求", http.StatusMethodNotAllowed)
			return
		}

		// 限制请求体大小
		r.Body = http.MaxBytesReader(w, r.Body, config.MaxRequestBodySize)
		
		// 读取请求体
		body, err := io.ReadAll(r.Body)
		if err != nil {
			log.Printf("读取请求失败: %v", err)
			http.Error(w, "读取请求失败", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		// 解析请求数据
		var requestData TranslationRequest
		if err := json.Unmarshal(body, &requestData); err != nil {
			log.Printf("JSON解析失败: %v", err)
			http.Error(w, "无效的JSON格式", http.StatusBadRequest)
			return
		}

		// 参数验证
		if err := validateRequest(&requestData); err != nil {
			log.Printf("请求验证失败: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// 创建模型配置
		modelConfig := AIModelConfig{
			Type:       requestData.ModelType,
			APIKey:     requestData.APIKey,
			APIURL:     requestData.APIURL,
			ModelName:  requestData.ModelName,
			SystemMsg:  requestData.SystemMsg,
		}

		// 创建带超时的上下文
		ctx, cancel := context.WithTimeout(r.Context(), config.RequestTimeout)
		defer cancel()

		// 调用AI API进行翻译
		log.Printf("开始翻译请求, 模型: %s", modelConfig.ModelName)
		
		// 使用翻译函数
		translation, err := handleTranslation(ctx, requestData.Text, modelConfig)
		if err != nil {
			log.Printf("翻译错误: %v", err)
			http.Error(w, fmt.Sprintf("翻译错误: %v", err), http.StatusInternalServerError)
			return
		}

		log.Printf("翻译成功, 结果长度: %d字符", len(translation))
		
		// 返回翻译结果
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]string{"translation": translation})
	})
}

// ==================== 中间件 ====================

// corsMiddleware 设置CORS响应头的中间件
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 允许所有来源
		w.Header().Set("Access-Control-Allow-Origin", "*")
		// 允许的HTTP方法
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		// 允许的HTTP头
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With")
		// 允许暴露的响应头
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Type")
		// 预检请求缓存时间
		w.Header().Set("Access-Control-Max-Age", "86400")

		// 处理预检请求
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// loggingMiddleware 添加请求日志的中间件
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("开始请求: %s %s", r.Method, r.URL.Path)
		
		next.ServeHTTP(w, r)
		
		log.Printf("完成请求: %s %s, 耗时: %v", r.Method, r.URL.Path, time.Since(start))
	})
}

// ==================== 业务逻辑处理 ====================

// validateRequest 验证请求参数
func validateRequest(req *TranslationRequest) error {
	if req.Text == "" {
		return fmt.Errorf("未提供要翻译的文本")
	}

	// 确保有模型类型
	if req.ModelType == "" {
		return fmt.Errorf("缺少必要的模型配置信息(modelType)")
	}

	// 检查系统消息是否存在
	if req.SystemMsg == "" {
		return fmt.Errorf("缺少必要的模型配置信息(systemMsg)")
	}

	// 检查必要参数是否存在
	if req.APIKey == "" || req.APIURL == "" || req.ModelName == "" {
		return fmt.Errorf("缺少必要的模型配置信息(apiKey, apiUrl, modelName)")
	}
	
	return nil
}

// ==================== 翻译功能 ====================

// handleTranslation 处理翻译请求
func handleTranslation(ctx context.Context, text string, modelConfig AIModelConfig) (string, error) {
	// 通用请求数据结构
	requestData := struct {
		Model    string        `json:"model"`
		Messages []ChatMessage `json:"messages"`
	}{
		Model: modelConfig.ModelName,
		Messages: []ChatMessage{
			{
				Role:    "system",
				Content: modelConfig.SystemMsg,
			},
			{
				Role:    "user",
				Content: text,
			},
		},
	}

	// 转换为JSON
	requestBody, err := json.Marshal(requestData)
	if err != nil {
		return "", fmt.Errorf("JSON编码失败: %v", err)
	}

	// 创建HTTP请求
	req, err := http.NewRequestWithContext(ctx, "POST", modelConfig.APIURL, bytes.NewBuffer(requestBody))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %v", err)
	}

	// 添加请求头
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", modelConfig.APIKey))

	// 创建自定义的HTTP客户端，设置超时
	client := &http.Client{
		Timeout: 25 * time.Second,
		Transport: &http.Transport{
			DisableKeepAlives: false,
			MaxIdleConns:      10,
			IdleConnTimeout:   30 * time.Second,
		},
	}
	
	// 发送请求
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("请求超时")
		}
		return "", fmt.Errorf("API请求失败: %v", err)
	}
	defer resp.Body.Close()
	
	// 检查HTTP状态码
	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		err := fmt.Errorf("API返回错误(状态码:%d): %s", resp.StatusCode, string(respBody))
		
		// 记录API错误响应头信息
		log.Printf("API错误响应头: %v", resp.Header)
		
		return "", err
	}

	log.Printf("API响应时间: %v", time.Since(start))

	// 读取响应
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %v", err)
	}

	// 解析响应 
	var response struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	
	if err := json.Unmarshal(respBody, &response); err != nil {
		return "", fmt.Errorf("JSON解析失败: %v", err)
	}

	// 检查是否有翻译结果
	if len(response.Choices) == 0 {
		return "", fmt.Errorf("未收到翻译结果")
	}

	return response.Choices[0].Message.Content, nil
}