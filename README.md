# 简易网页AI翻译工具

这是一个简洁的网页翻译工具，允许您在任何网站上选中文本后立即获取中文翻译。该工具使用Tampermonkey脚本实现，直接调用AI API进行翻译，无需后端服务。

## 特性

- 支持多种AI模型（DeepSeek, OpenAI等）
- 即选即译，无需额外操作
- 简洁的翻译结果弹窗
- 轻量级设计，无复杂配置
- 直接调用AI API，无需后端服务
- 使用流式响应，实时显示翻译结果
- 绕过CSP限制，可在任何网站使用

## 安装步骤

### 安装Tampermonkey浏览器扩展

1. 安装[Tampermonkey浏览器扩展](https://www.tampermonkey.net/)
2. 打开Tampermonkey控制面板
3. 点击"创建新脚本"
4. 将`tampermonkey.js`文件中的内容复制粘贴到编辑器中
5. 修改脚本中的API密钥和其他配置
6. 点击"保存"

## 使用方法

1. 确保已配置有效的API密钥（DeepSeek或OpenAI）
2. 在网页上选中您想要翻译的文本
3. 自动显示翻译结果弹窗

就这么简单！无需额外配置或手动触发。

## 配置选项

所有配置都在Tampermonkey脚本中进行。请修改脚本中的`CONFIG`对象：

```javascript
const CONFIG = {
    model: 'deepseek', // 默认使用的模型
    models: {
        deepseek: {
            apiKey: '', // 填入你的 DeepSeek API Key
            apiUrl: 'https://api.deepseek.com/v1/chat/completions',
            modelName: 'deepseek-chat',
            systemMsg: '你是一个翻译助手，请将输入的文本翻译成中文。只返回翻译结果，不要添加额外的解释。'
        },
        openai: {
            apiKey: '', // 填入你的 OpenAI API Key
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            modelName: 'gpt-4o',
            systemMsg: '你是一个翻译助手，请将输入的文本翻译成中文。只返回翻译结果，不要添加额外的解释。'
        }
    }
};
```

主要配置选项：
- `model`：默认使用的AI模型（如'deepseek'或'openai'）
- `models`：各个模型的详细配置
  - `apiKey`：对应服务的API密钥
  - `apiUrl`：API服务地址
  - `modelName`：使用的模型名称
  - `systemMsg`：系统提示信息

如需限制脚本只在特定网站上运行，请修改脚本头部的`@match`规则。目前默认配置为在所有HTTPS网站上运行：

```
// @match        https://*/*
```

## 添加新的AI模型

要添加新的AI模型，只需在脚本的`CONFIG.models`对象中添加相应的模型配置：

```javascript
models: {
    // 已有模型配置...
    new_model: {
        apiKey: '', // 填入API Key
        apiUrl: 'https://api.example.com/v1/completions',
        modelName: 'model-name',
        systemMsg: '你是一个翻译助手，请将输入的文本翻译成中文。只返回翻译结果，不要添加额外的解释。'
    }
}
```

然后将`CONFIG.model`设置为新模型的名称即可切换使用。

## 技术细节

- 使用 `GM_xmlhttpRequest` 绕过浏览器的跨域和CSP限制
- 使用流式响应处理，实时显示翻译结果
- 支持异步处理和流式传输的大型文本
- 采用 `TextDecoder` 处理二进制响应数据
- 实现了打字机效果，逐字显示翻译结果

## 问题排查

如果翻译不工作，请检查：

1. 浏览器控制台是否有错误信息
2. API密钥是否正确填写在脚本中
3. 是否在Tampermonkey的`@match`规则允许的网站上使用
4. 如果遇到"API返回错误(状态码:401)"，请检查API密钥是否有效或是否已过期

## 常见错误解决方案

1. **401认证错误** - 通常表示API密钥不正确或已过期，请检查并更新API密钥
2. **CSP限制** - 如果遇到内容安全策略限制，请确保Tampermonkey脚本包含以下权限：
   ```
   // @grant        GM_xmlhttpRequest
   // @connect      api.deepseek.com
   // @connect      api.openai.com
   ```

## 注意事项

- 该工具默认在所有HTTPS网站上运行，可通过修改`@match`规则改变
- 翻译质量依赖于所选AI模型的性能
- 使用公共API服务需要API密钥，请确保遵守相应服务的使用条款
- 文本长度限制为5000字符，超过部分会被截断

## 许可证

MIT