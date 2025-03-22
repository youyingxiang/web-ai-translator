// ==UserScript==
// @name         简易网页AI翻译工具
// @namespace    http://tampermonkey.net/
// @version      2025-03-22
// @description  在网页上选中文本后自动翻译成中文，支持DeepSeek和OpenAI，使用GM_xmlhttpRequest绕过CSP限制
// @author       You
// @match        https://*/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @connect      api.deepseek.com
// @connect      api.openai.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle

// ==/UserScript==


(function() {
    'use strict';
    
    // 翻译服务配置
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
    
    // 添加样式
    GM_addStyle(`
        #simple-translator-popup {
            position: absolute;
            z-index: 10000;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            padding: 10px;
            max-width: 400px;
            max-height: 300px;
            overflow-y: auto;
            font-family: Arial, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            color: #333;
            display: none;
        }
        
        #simple-translator-popup .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            padding-bottom: 5px;
            border-bottom: 1px solid #eee;
        }
        
        #simple-translator-popup .close-btn {
            cursor: pointer;
            font-size: 16px;
            color: #888;
        }
        
        #simple-translator-popup .content {
            word-break: break-word;
        }
        
        .cursor-blink {
            display: inline-block;
            width: 2px;
            height: 14px;
            background-color: #333;
            vertical-align: middle;
            animation: blink 1s infinite;
            margin-left: 1px;
        }
        
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }
    `);

    // 创建翻译弹窗
    let popup = null;
    let isTranslating = false;
    
    function createPopup() {
        // 如果已存在弹窗，则移除
        if (popup) {
            document.body.removeChild(popup);
        }
        
        // 创建新弹窗
        popup = document.createElement('div');
        popup.id = 'simple-translator-popup';
        popup.innerHTML = `
            <div class="header">
                <div>AI翻译</div>
                <div class="close-btn">×</div>
            </div>
            <div class="content"></div>
        `;
        
        // 绑定关闭按钮事件
        popup.querySelector('.close-btn').addEventListener('click', () => {
            hidePopup();
        });
        
        // 添加键盘事件监听器，按ESC键关闭弹窗
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && popup.style.display === 'block') {
                hidePopup();
            }
        });
        
        // 添加到页面
        document.body.appendChild(popup);
        
        return popup;
    }
    
    // 显示弹窗
    function showPopup(x, y) {
        if (!popup) {
            createPopup();
        }
        
        // 设置初始位置
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
        
        // 显示弹窗以便获取尺寸
        popup.style.display = 'block';
        
        // 获取窗口和弹窗尺寸
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const popupRect = popup.getBoundingClientRect();
        
        // 调整位置，确保弹窗完全在视窗内
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        
        let adjustedX = x;
        let adjustedY = y;
        
        if (x + popupRect.width > scrollX + viewportWidth) {
            adjustedX = scrollX + viewportWidth - popupRect.width - 10;
        }
        
        if (y + popupRect.height > scrollY + viewportHeight) {
            adjustedY = scrollY + viewportHeight - popupRect.height - 10;
        }
        
        popup.style.left = `${Math.max(scrollX, adjustedX)}px`;
        popup.style.top = `${Math.max(scrollY, adjustedY)}px`;
    }
    
    // 隐藏弹窗
    function hidePopup() {
        if (popup) {
            popup.style.display = 'none';
        }
        isTranslating = false;
    }
    
    // 设置弹窗内容
    function setPopupContent(content) {
        if (popup) {
            popup.querySelector('.content').innerHTML = content;
        }
    }
    
    /**
     * 处理流式响应数据
     * @param {string} data - 响应数据
     */
    function processStreamData(data) {
        try {
            // 如果数据已经是字符串形式的 JSON，直接解析
            const parsed = JSON.parse(data);
            if (parsed.choices && parsed.choices.length > 0) {
                const choice = parsed.choices[0];
                if (choice.delta && choice.delta.content) {
                    // 获取内容
                    const content = choice.delta.content;
                    console.log('解析到内容:', content);
                    // 逐字显示内容
                    displayContentWithDelay(content);
                }
            }
        } catch (e) {
            console.error('解析 JSON 数据出错:', e);
        }
    }
    
    // 简单延迟显示队列
    let displayQueue = [];
    let isDisplaying = false;
    
    /**
     * 按延迟逐字显示内容
     * @param {string} content - 要显示的内容
     */
    function displayContentWithDelay(content) {
        // 添加到显示队列
        const chars = content.split('');
        displayQueue.push(...chars);
        
        // 如果没有显示进行中，开始显示
        if (!isDisplaying) {
            displayNextChar();
        }
    }
    
    /**
     * 显示队列中的下一个字符
     */
    function displayNextChar() {
        if (displayQueue.length === 0) {
            isDisplaying = false;
            return;
        }
        
        isDisplaying = true;
        
        // 获取并显示下一个字符
        const char = displayQueue.shift();
        appendToPopup(char);
        
        // 延迟显示下一个字符
        setTimeout(displayNextChar, 10);
    }
    
    /**
     * 将字符附加到弹窗内容
     * @param {string} char - 要附加的字符
     */
    function appendToPopup(char) {
        if (!popup) return;
        
        const contentEl = popup.querySelector('.content');
        
        // 移除闪烁光标，如果存在
        const cursor = contentEl.querySelector('.cursor-blink');
        if (cursor && cursor.parentNode === contentEl) {
            contentEl.removeChild(cursor);
        }
        
        // 如果内容是"翻译中..."，则清除
        if (contentEl.textContent.trim() === '' || contentEl.textContent.trim() === '翻译中...') {
            contentEl.textContent = '';
        }
        
        // 创建文本节点添加字符
        const textNode = document.createTextNode(char);
        contentEl.appendChild(textNode);
        
        // 重新添加光标
        const newCursor = document.createElement('span');
        newCursor.className = 'cursor-blink';
        contentEl.appendChild(newCursor);
        
        // 自动滚动到底部
        contentEl.scrollTop = contentEl.scrollHeight;
    }
    
    /**
     * 完成翻译过程
     */
    function finishTranslation() {
        isTranslating = false;
        
        // 移除光标
        if (popup) {
            const contentEl = popup.querySelector('.content');
            const cursor = contentEl.querySelector('.cursor-blink');
            if (cursor && cursor.parentNode === contentEl) {
                contentEl.removeChild(cursor);
            }
        }
    }
    
    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    // 翻译文本函数
    async function translateText(text) {
        if (!text || isTranslating) return;
        
        // 防止重复翻译
        isTranslating = true;
        
        // 清空显示队列
        displayQueue = [];
        isDisplaying = false;
        
        try {
            // 确保文本长度合理
            if (text.length > 5000) {
                text = text.substring(0, 5000) + '...'; // 限制文本长度
            }
            
            // 创建或更新弹窗
            const selection = window.getSelection();
            if (!selection.rangeCount) {
                isTranslating = false;
                return;
            }
            
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollY = window.pageYOffset || document.documentElement.scrollTop;
            
            showPopup(rect.left + scrollX, rect.bottom + scrollY + 5);
            setPopupContent('<div>翻译中...<div class="cursor-blink"></div></div>');

            // 获取选定的模型配置
            const modelType = CONFIG.model;
            const modelConfig = CONFIG.models[modelType];
            
            // 检查模型配置
            if (!modelConfig) {
                setPopupContent('<div>模型配置错误，请检查脚本设置</div>');
                isTranslating = false;
                return;
            }
            
            // 检查API密钥
            if (!modelConfig.apiKey) {
                setPopupContent('<div>请在脚本中配置API密钥</div>');
                isTranslating = false;
                return;
            }
            
            // 创建请求数据（直接请求AI模型）
            const requestData = {
                model: modelConfig.modelName,
                messages: [
                    {
                        role: "system",
                        content: modelConfig.systemMsg
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                stream: true // 始终使用流式响应
            };
            
            // 使用 GM_xmlhttpRequest 发送请求，它可以绕过CSP限制
            console.log('使用 GM_xmlhttpRequest 绕过CSP限制');
            let responseBuffer = '';
            const textDecoder = new TextDecoder();
            
            GM_xmlhttpRequest({
                method: 'POST',
                url: modelConfig.apiUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${modelConfig.apiKey}`
                },
                data: JSON.stringify(requestData),
                responseType: 'arraybuffer', // 使用二进制数据格式
                onreadystatechange: function(response) {
                    console.log('onreadystatechange 被调用，readyState:', response.readyState);
                    
                    // readyState 3 表示正在接收数据，4 表示完成
                    if (response.readyState !== 3 && response.readyState !== 4) return;
                    
                    try {
                        if (response.response) {
                            // 将二进制响应转换为文本
                            const value = new Uint8Array(response.response);
                            const newText = textDecoder.decode(value, { stream: true });
                            
                            // 计算新增部分
                            const newData = newText.substring(responseBuffer.length);
                            responseBuffer = newText;
                            
                            // 确保数据不为空
                            if (!newData) return;
                            
                            // 处理新数据（按行拆分处理）
                            const lines = newData.split('\n');
                            for (const line of lines) {
                                if (line.trim() === '') continue;
                                if (line.startsWith('data: ')) {
                                    if (line === 'data: [DONE]') continue;
                                    
                                    // 直接传递 JSON 内容字符串给 processStreamData
                                    const content = line.substring(6);
                                    processStreamData(content);
                                }
                            }
                        }
                        
                        // 如果请求完成，调用finishTranslation
                        if (response.readyState === 4) {
                            console.log('请求完成');
                            finishTranslation();
                            
                            // 检查状态码
                            if (response.status !== 200) {
                                setPopupContent(`<div>翻译失败: API返回错误 ${response.status}</div>`);
                                isTranslating = false;
                            }
                        }
                    } catch (e) {
                        console.error('处理响应数据时出错:', e);
                    }
                },
                onload: function(response) {
                    console.log('onload 被调用');
                    // 备用完成处理，以防onreadystatechange没有正确触发完成事件
                    if (isTranslating) {
                        finishTranslation();
                    }
                },
                onerror: function(error) {
                    console.error('API请求失败:', error);
                    setPopupContent(`<div>翻译失败: ${error.statusText || '请求错误'}</div>`);
                    isTranslating = false;
                }
            });
        } catch (e) {
            console.error('翻译过程发生错误:', e);
            setPopupContent('<div>翻译过程发生错误。</div>');
            isTranslating = false;
        }
    }
    
    // 处理文本选择 (使用防抖)
    const debouncedHandleTextSelection = debounce(function() {
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            translateText(selectedText);
        } else {
            hidePopup();
        }
    }, 300);
    
    // 绑定事件 - 选择文本后自动翻译
    document.addEventListener('mouseup', debouncedHandleTextSelection);
    
    // 点击页面其他位置时隐藏弹窗
    document.addEventListener('click', function(e) {
        if (popup && popup.style.display === 'block' && !popup.contains(e.target)) {
            hidePopup();
        }
    });
    
    console.log('简易网页AI翻译工具已加载，使用GM_xmlhttpRequest绕过CSP限制');
})(); 