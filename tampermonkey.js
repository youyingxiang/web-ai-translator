// ==UserScript==
// @name         简易网页AI翻译工具
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在网页上选中文本后自动翻译成中文
// @author       AI助手
// @match        https://github.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// ==/UserScript==

(function() {
    'use strict';
    
    // 翻译服务配置
    const CONFIG = {
        url: 'http://localhost:8080/api/v1/translate', // 翻译服务URL
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
    
    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    // 翻译文本函数
    function translateText(text) {
        if (!text || isTranslating) return;
        
        // 防止重复翻译
        isTranslating = true;
        
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
            setPopupContent('<div>翻译中...</div>');

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
            
            // 创建请求数据
            const requestData = {
                text: text,
                modelType: modelType,
                apiKey: modelConfig.apiKey,
                apiUrl: modelConfig.apiUrl,
                modelName: modelConfig.modelName,
                systemMsg: modelConfig.systemMsg,
            };
            
            // 发送翻译请求
            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.url,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(requestData),
                timeout: 30000, // 30秒超时
                onload: function(response) {
                    try {
                        if (response.status !== 200) {
                            setPopupContent(`<div>服务器错误: ${response.status}</div>`);
                            console.error('服务器返回错误:', response.status, response.statusText);
                            isTranslating = false;
                            return;
                        }
                        
                        const result = JSON.parse(response.responseText);
                        if (result.translation) {
                            setPopupContent(`<div>${result.translation}</div>`);
                        } else {
                            setPopupContent('<div>翻译失败，请重试。</div>');
                            console.error('翻译返回结果无效:', result);
                        }
                    } catch (e) {
                        setPopupContent('<div>解析翻译结果失败。</div>');
                        console.error('解析翻译结果失败:', e, response.responseText);
                    } finally {
                        isTranslating = false;
                    }
                },
                onerror: function(error) {
                    setPopupContent('<div>连接翻译服务失败，请检查服务是否运行。</div>');
                    console.error('请求翻译服务失败:', error);
                    isTranslating = false;
                },
                ontimeout: function() {
                    setPopupContent('<div>翻译请求超时，请稍后重试。</div>');
                    console.error('翻译请求超时');
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
    
    console.log('简易网页AI翻译工具已加载，使用普通翻译模式');
})(); 