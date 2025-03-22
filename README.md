# 简易网页AI翻译工具

这是一个简洁的网页翻译工具，允许您在网站上选中文本后立即获取中文翻译。该工具由两部分组成：

1. Go后端服务：负责与各种AI API通信并执行翻译
2. Tampermonkey脚本：负责在浏览器中捕获选中的文本并显示翻译结果

## 特性

- 支持多种AI模型（DeepSeek, OpenAI等）
- 即选即译，无需额外操作
- 简洁的翻译结果弹窗
- 轻量级设计，无复杂配置

## 安装步骤

### 1. 安装Go后端服务

确保您已安装Go环境（建议1.16或更高版本）。

```bash
# 克隆仓库
git clone https://github.com/yourusername/web-ai-translator.git
cd web-ai-translator

# 运行Go服务
go run main.go
```

首次运行会自动创建默认配置文件`config.json`，您可以根据需要修改此文件：

```json
{
  "port": 8080,
  "defaultModel": "deepseek",
  "models": {
    "deepseek": {
      "type": "deepseek",
      "apiKey": "your-api-key-here",
      "apiUrl": "https://api.deepseek.com/v1/chat/completions",
      "modelName": "deepseek-chat",
      "systemMsg": "你是一个翻译助手，请将输入的文本翻译成中文。只返回翻译结果，不要添加额外的解释。"
    },
    "openai": {
      "type": "openai",
      "apiKey": "your-api-key-here",
      "apiUrl": "https://api.openai.com/v1/chat/completions",
      "modelName": "gpt-3.5-turbo",
      "systemMsg": "你是一个翻译助手，请将输入的文本翻译成中文。只返回翻译结果，不要添加额外的解释。"
    }
  }
}
```

### 2. 安装Tampermonkey浏览器扩展

1. 安装[Tampermonkey浏览器扩展](https://www.tampermonkey.net/)
2. 打开Tampermonkey控制面板
3. 点击"创建新脚本"
4. 将`tampermonkey.js`文件中的内容复制粘贴到编辑器中
5. 点击"保存"

## 使用方法

1. 确保Go后端服务正在运行（默认地址为http://localhost:8080）
2. 在网页上选中您想要翻译的文本
3. 自动显示翻译结果弹窗

就这么简单！无需额外配置或手动触发。

## 配置选项

### Go服务配置

编辑`config.json`文件来配置：

- 服务端口
- 默认AI模型
- 各模型的API密钥和URL
- 系统提示信息

### Tampermonkey脚本配置

如需修改脚本配置，请直接编辑脚本中的`CONFIG`对象：

```javascript
const CONFIG = {
    url: 'http://localhost:8080/translate', // 翻译服务URL
    model: 'deepseek' // 默认使用的模型
};
```

如需限制脚本只在特定网站上运行，请修改脚本头部的`@match`规则。目前默认配置为只在GitHub上运行：

```
// @match        https://github.com/*
```

## 添加新的AI模型

要添加新的AI模型，只需：

1. 在`config.json`中添加新模型配置
2. 在`main.go`的`translateWithLLMApi`函数中检查是否需要特殊处理
3. 在`translateWithAI`函数中添加新的case

## 问题排查

如果翻译不工作，请检查：

1. Go服务是否正在运行（默认地址为http://localhost:8080）
2. 浏览器控制台是否有错误信息
3. AI模型API密钥是否正确
4. 是否在Tampermonkey的`@match`规则允许的网站上使用

## 注意事项

- 该工具默认只在GitHub上运行，可通过修改`@match`规则改变
- 需要运行后端服务进行翻译
- 翻译质量依赖于所选AI模型的性能
- 可以将后端服务部署在任何可访问的服务器上，只需在Tampermonkey脚本中更新服务URL
- 请确保您拥有API密钥的使用权限，并遵守相应API服务的使用条款

## 许可证

MIT