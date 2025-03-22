package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strconv"
)

// AIModelConfig 存储AI模型配置
type AIModelConfig struct {
	Type       string `json:"type"`
	APIKey     string `json:"apiKey"`
	APIURL     string `json:"apiUrl"`
	ModelName  string `json:"modelName"`
	SystemMsg  string `json:"systemMsg"`
}

// Config 程序全局配置
type Config struct {
	Port          int                   `json:"port"`
	DefaultModel  string                `json:"defaultModel"`
	Models        map[string]AIModelConfig `json:"models"`
}

// ChatMessage 表示聊天消息格式
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// 通用请求结构
type TranslationRequest struct {
	Text      string `json:"text"`
	ModelType string `json:"modelType"`
}

// 配置实例
var config Config

// 初始化配置
func initConfig() error {
	// 默认配置
	config = Config{
		Port:          8080,
		DefaultModel:  "deepseek",
		Models: map[string]AIModelConfig{
			"deepseek": {
				Type:       "deepseek",
				APIKey:     "",
				APIURL:     "https://api.deepseek.com/v1/chat/completions",
				ModelName:  "deepseek-chat",
				SystemMsg:  "你是一个翻译助手，请将输入的文本翻译成中文。只返回翻译结果，不要添加额外的解释。",
			},
			"openai": {
				Type:       "openai",
				APIKey:     "",
				APIURL:     "https://api.openai.com/v1/chat/completions",
				ModelName:  "gpt-3.5-turbo",
				SystemMsg:  "你是一个翻译助手，请将输入的文本翻译成中文。只返回翻译结果，不要添加额外的解释。",
			},
		},
	}

	// 检查配置文件是否存在
	if _, err := os.Stat("config.json"); err == nil {
		configFile, err := os.ReadFile("config.json")
		if err != nil {
			return fmt.Errorf("读取配置文件失败: %v", err)
		}

		// 解析配置文件
		if err := json.Unmarshal(configFile, &config); err != nil {
			return fmt.Errorf("解析配置文件失败: %v", err)
		}
	} else {
		// 配置文件不存在，创建默认配置
		configFile, err := json.MarshalIndent(config, "", "  ")
		if err != nil {
			return fmt.Errorf("创建默认配置失败: %v", err)
		}

		if err := os.WriteFile("config.json", configFile, 0644); err != nil {
			return fmt.Errorf("保存默认配置失败: %v", err)
		}
		
		fmt.Println("已创建默认配置文件 config.json，请根据需要修改")
	}

	// 从环境变量读取端口（如果有）
	if portStr := os.Getenv("PORT"); portStr != "" {
		if port, err := strconv.Atoi(portStr); err == nil {
			config.Port = port
		}
	}

	return nil
}

func main() {
	// 初始化配置
	if err := initConfig(); err != nil {
		log.Fatalf("初始化配置失败: %v", err)
	}

	// 设置CORS响应头
	corsMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}

	// 创建API信息路由
	infoHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 返回可用模型信息
		modelTypes := make([]string, 0, len(config.Models))
		for modelType := range config.Models {
			modelTypes = append(modelTypes, modelType)
		}
		
		info := map[string]interface{}{
			"defaultModel": config.DefaultModel,
			"availableModels": modelTypes,
		}
		
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(info)
	})

	// 创建翻译处理程序
	translateHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "仅支持POST请求", http.StatusMethodNotAllowed)
			return
		}

		// 读取请求体
		body, err := ioutil.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "读取请求失败", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		// 解析请求数据
		var requestData TranslationRequest
		if err := json.Unmarshal(body, &requestData); err != nil {
			http.Error(w, "无效的JSON格式", http.StatusBadRequest)
			return
		}

		// 如果未指定模型类型，使用默认模型
		modelType := requestData.ModelType
		if modelType == "" {
			modelType = config.DefaultModel
		}

		// 检查模型是否存在
		modelConfig, exists := config.Models[modelType]
		if !exists {
			http.Error(w, "不支持的AI模型类型", http.StatusBadRequest)
			return
		}

		// 调用AI API进行翻译
		translation, err := translateWithAI(requestData.Text, modelConfig)
		if err != nil {
			http.Error(w, fmt.Sprintf("翻译错误: %v", err), http.StatusInternalServerError)
			return
		}

		// 返回翻译结果
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]string{"translation": translation})
	})

	// 设置路由
	http.Handle("/translate", corsMiddleware(translateHandler))
	http.Handle("/api/info", corsMiddleware(infoHandler))

	// 添加一个简单的首页，提供基本信息
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<title>AI翻译服务</title>
			<style>
				body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
				h1 { color: #333; }
				code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
			</style>
		</head>
		<body>
			<h1>AI翻译服务</h1>
			<p>服务正在运行中。API端点: <code>/translate</code></p>
			<p>请使用Tampermonkey脚本来连接此服务。</p>
			<p>可用的API模型信息: <a href="/api/info">/api/info</a></p>
		</body>
		</html>
		`)
	})

	// 启动服务器
	port := config.Port
	fmt.Printf("翻译服务运行在 http://localhost:%d\n", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), nil))
}

// translateWithAI 使用指定的AI服务翻译文本
func translateWithAI(text string, modelConfig AIModelConfig) (string, error) {
	switch modelConfig.Type {
	case "deepseek", "openai":
		return translateWithLLMApi(text, modelConfig)
	default:
		return "", fmt.Errorf("不支持的AI模型类型: %s", modelConfig.Type)
	}
}

// translateWithLLMApi 通用的LLM API翻译函数
func translateWithLLMApi(text string, model AIModelConfig) (string, error) {
	// 通用请求数据结构
	requestData := struct {
		Model    string        `json:"model"`
		Messages []ChatMessage `json:"messages"`
	}{
		Model: model.ModelName,
		Messages: []ChatMessage{
			{
				Role:    "system",
				Content: model.SystemMsg,
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
	req, err := http.NewRequest("POST", model.APIURL, bytes.NewBuffer(requestBody))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %v", err)
	}

	// 添加请求头
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", model.APIKey))

	// 发送请求
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("API请求失败: %v", err)
	}
	defer resp.Body.Close()

	// 读取响应
	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %v", err)
	}

	// 检查HTTP状态码
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API返回错误: %s", string(respBody))
	}

	// 解析响应 (DeepSeek和OpenAI有相同的响应结构)
	var llmResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	
	if err := json.Unmarshal(respBody, &llmResp); err != nil {
		return "", fmt.Errorf("JSON解析失败: %v", err)
	}

	// 检查是否有翻译结果
	if len(llmResp.Choices) == 0 {
		return "", fmt.Errorf("未收到翻译结果")
	}

	return llmResp.Choices[0].Message.Content, nil
} 