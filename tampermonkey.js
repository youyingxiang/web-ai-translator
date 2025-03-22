// ==UserScript==
// @name         简易网页AI翻译工具
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在网页上选中文本后自动翻译成中文
// @author       AI助手
// @match        https://github.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';
    
    // 翻译服务配置
    const CONFIG = {
        url: 'http://localhost:8080/translate', // 翻译服务URL
        model: 'deepseek' // 默认使用的模型
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
    `);

    // 创建翻译弹窗
    let popup = null;
    
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
        
        // 添加到页面
        document.body.appendChild(popup);
        
        return popup;
    }
    
    // 显示弹窗
    function showPopup(x, y) {
        if (!popup) {
            createPopup();
        }
        
        // 调整位置
        const bodyRect = document.body.getBoundingClientRect();
        const maxX = bodyRect.width - popup.offsetWidth - 20;
        const maxY = bodyRect.height - popup.offsetHeight - 20;
        
        popup.style.left = `${Math.min(x, maxX)}px`;
        popup.style.top = `${Math.min(y, maxY)}px`;
        
        // 显示弹窗
        popup.style.display = 'block';
    }
    
    // 隐藏弹窗
    function hidePopup() {
        if (popup) {
            popup.style.display = 'none';
        }
    }
    
    // 设置弹窗内容
    function setPopupContent(content) {
        if (popup) {
            popup.querySelector('.content').innerHTML = content;
        }
    }
    
    // 翻译文本
    function translateText(text) {
        if (!text) return;
        
        // 创建或更新弹窗
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        
        showPopup(rect.left + scrollX, rect.bottom + scrollY + 5);
        setPopupContent('<div>翻译中...</div>');
        
        // 发送请求到翻译服务
        GM_xmlhttpRequest({
            method: 'POST',
            url: CONFIG.url,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                text: text,
                modelType: CONFIG.model
            }),
            onload: function(response) {
                try {
                    const result = JSON.parse(response.responseText);
                    if (result.translation) {
                        setPopupContent(`<div>${result.translation}</div>`);
                    } else {
                        setPopupContent('<div>翻译失败，请重试。</div>');
                    }
                } catch (e) {
                    setPopupContent('<div>解析翻译结果失败。</div>');
                    console.error('解析翻译结果失败:', e);
                }
            },
            onerror: function() {
                setPopupContent('<div>连接翻译服务失败，请检查服务是否运行。</div>');
            }
        });
    }
    
    // 处理文本选择
    function handleTextSelection() {
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            translateText(selectedText);
        }
    }
    
    // 绑定事件 - 选择文本后自动翻译
    document.addEventListener('mouseup', handleTextSelection);
    
    console.log('简易网页AI翻译工具已加载');
})(); 