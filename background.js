// キーボードショートカットのハンドラー
chrome.commands.onCommand.addListener((command) => {
  if (command === 'translate-selection') {
    // アクティブなタブのコンテンツスクリプトに翻訳開始を通知
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'translateSelection' });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'translate') {
    translateText(request.text)
      .then(translation => {
        sendResponse({ success: true, translation });
      })
      .catch(error => {
        console.error('翻訳エラー:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'getHistory') {
    getTranslationHistory(request.limit)
      .then(history => {
        sendResponse({ success: true, history });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'deleteHistoryItem') {
    deleteHistoryItem(request.itemId)
      .then(success => {
        sendResponse({ success });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'clearHistory') {
    clearTranslationHistory()
      .then(success => {
        sendResponse({ success });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  sendResponse({ success: false, error: 'Unknown action' });
  return false;
});

async function translateText(text) {
  
  // APIキーとモデルを取得
  const result = await chrome.storage.sync.get(['geminiApiKey', 'geminiModel']);
  const apiKey = result.geminiApiKey;
  const model = result.geminiModel || 'gemini-2.5-flash'; // デフォルトを修正
  
  if (!apiKey) {
    throw new Error('Gemini APIキーが設定されていません。拡張機能の設定から入力してください。');
  }
  

  const prompt = `以下のテキストを自動的に言語を検出して翻訳してください。

ルール:
- 日本語の場合は英語に翻訳
- 英語の場合は日本語に翻訳
- その他の言語の場合は日本語に翻訳
- 翻訳結果のみを返してください（説明や余計な文章は不要）

テキスト: "${text}"`;

  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1000
    }
  };

  try {
    
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error:', errorData);
      throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    
    // レスポンスの構造を程密にチェック
    if (!data || typeof data !== 'object') {
      console.error('Invalid response: not an object:', data);
      throw new Error('翻訳APIからのレスポンスが不正です。');
    }
    
    // error フィールドのチェック
    if (data.error) {
      console.error('API returned error:', data.error);
      throw new Error(`APIエラー: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    // candidates のチェック
    if (!data.candidates) {
      console.error('No candidates in response:', data);
      throw new Error('翻訳結果に候補がありません。モデルが対応していない可能性があります。');
    }
    
    if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
      console.error('Invalid candidates array:', data.candidates);
      throw new Error('翻訳結果の候補が空です。');
    }
    
    const candidate = data.candidates[0];
    
    // finishReason のチェック
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('Candidate finished with reason:', candidate.finishReason);
      if (candidate.finishReason === 'SAFETY') {
        throw new Error('コンテンツが安全フィルターによってブロックされました。');
      } else if (candidate.finishReason === 'RECITATION') {
        throw new Error('コンテンツが著作権フィルターによってブロックされました。');
      } else if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error('翻訳結果が長すぎて切り詰められました。短いテキストでお試しください。');
      } else {
        throw new Error(`翻訳が予期せず終了しました: ${candidate.finishReason}`);
      }
    }
    
    // content のチェック
    if (!candidate.content) {
      console.error('No content in candidate:', candidate);
      throw new Error('翻訳結果の候補にコンテンツがありません。');
    }
    
    // parts のチェック（より柔軟に）
    let parts = candidate.content.parts;
    if (!parts) {
      // parts がない場合、直接 text を探す
      if (typeof candidate.content.text === 'string') {
        const translation = candidate.content.text.trim();
        if (translation) {
          return translation;
        }
      }
      
      console.error('No parts in content and no direct text:', candidate.content);
      throw new Error('翻訳結果のコンテンツにテキストがありません。');
    }
    
    if (!Array.isArray(parts) || parts.length === 0) {
      console.error('Invalid parts array:', parts);
      throw new Error('翻訳結果のコンテンツに有効なパーツがありません。');
    }
    
    const part = parts[0];
    
    if (!part || typeof part !== 'object') {
      console.error('Invalid part structure:', part);
      throw new Error('翻訳結果のパートが不正です。');
    }
    
    if (typeof part.text !== 'string') {
      console.error('No text in part:', part);
      throw new Error('翻訳テキストが取得できません。');
    }
    
    const translation = part.text.trim();
    if (!translation) {
      console.error('Empty translation result');
      throw new Error('翻訳結果が空です。');
    }
    
    
    // 翻訳履歴に保存
    await saveTranslationHistory(text, translation);
    
    return translation;
  } catch (error) {
    console.error('Translation error:', error);
    
    if (error.message.includes('API_KEY_INVALID')) {
      throw new Error('無効なAPIキーです。正しいGemini APIキーを設定してください。');
    } else if (error.message.includes('QUOTA_EXCEEDED')) {
      throw new Error('API使用量の上限に達しました。しばらく待ってからお試しください。');
    } else if (error.message.includes('SAFETY')) {
      throw new Error('コンテンツが安全フィルターによってブロックされました。別のテキストでお試しください。');
    } else if (error.message.includes('RECITATION')) {
      throw new Error('コンテンツが著作権フィルターによってブロックされました。');
    } else {
      // 元のエラーをそのまま投げる（二重ラップを防ぐ）
      throw error;
    }
  }
}

// 翻訳履歴を保存する関数
async function saveTranslationHistory(originalText, translation) {
  try {
    // 既存の履歴を取得
    const result = await chrome.storage.local.get(['translationHistory']);
    let history = result.translationHistory || [];
    
    // 新しい履歴項目を作成
    const historyItem = {
      id: Date.now().toString(),
      originalText: originalText,
      translatedText: translation,
      timestamp: new Date().toISOString(),
      url: '',  // コンテンツスクリプトから送信される場合に設定
      language: detectLanguage(originalText)
    };
    
    // 履歴の先頭に追加
    history.unshift(historyItem);
    
    // 最大100件まで保持
    if (history.length > 100) {
      history = history.slice(0, 100);
    }
    
    // 保存
    await chrome.storage.local.set({ translationHistory: history });
  } catch (error) {
    console.error('Failed to save translation history:', error);
  }
}

// 簡単な言語検出
function detectLanguage(text) {
  // 日本語文字（ひらがな、カタカナ、漢字）が含まれているかチェック
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
    return 'ja';
  }
  // その他は英語として扱う（簡易実装）
  return 'en';
}

// 翻訳履歴を取得する関数
async function getTranslationHistory(limit = 50) {
  try {
    const result = await chrome.storage.local.get(['translationHistory']);
    const history = result.translationHistory || [];
    return limit ? history.slice(0, limit) : history;
  } catch (error) {
    console.error('Failed to get translation history:', error);
    return [];
  }
}

// 履歴から項目を削除する関数
async function deleteHistoryItem(itemId) {
  try {
    const result = await chrome.storage.local.get(['translationHistory']);
    let history = result.translationHistory || [];
    
    history = history.filter(item => item.id !== itemId);
    
    await chrome.storage.local.set({ translationHistory: history });
    return true;
  } catch (error) {
    console.error('Failed to delete history item:', error);
    return false;
  }
}

// 履歴をクリアする関数
async function clearTranslationHistory() {
  try {
    await chrome.storage.local.set({ translationHistory: [] });
    return true;
  } catch (error) {
    console.error('Failed to clear translation history:', error);
    return false;
  }
}
