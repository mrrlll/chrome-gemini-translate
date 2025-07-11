// ポップアップのJavaScript
document.addEventListener('DOMContentLoaded', function() {
  const settingsForm = document.getElementById('settingsForm');
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('modelSelect');
  const testBtn = document.getElementById('testBtn');
  const statusMessage = document.getElementById('statusMessage');

  chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], function(result) {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.geminiModel) {
      modelSelect.value = result.geminiModel;
    } else {
      modelSelect.value = 'gemini-2.5-flash';
    }
  });

  settingsForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    const selectedModel = modelSelect.value;

    if (!apiKey) {
      showMessage('APIキーを入力してください', 'error');
      return;
    }

    chrome.storage.sync.set({
      geminiApiKey: apiKey,
      geminiModel: selectedModel
    }, function() {
      showMessage('設定が保存されました', 'success');
    });
  });

  testBtn.addEventListener('click', async function() {
    const apiKey = apiKeyInput.value.trim();
    const selectedModel = modelSelect.value;

    if (!apiKey) {
      showMessage('APIキーを入力してください', 'error');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'テスト中...';

    try {
      const isValid = await testApiKey(apiKey, selectedModel);
      if (isValid) {
        showMessage('APIキーが有効です', 'success');
      } else {
        showMessage('APIキーが無効です', 'error');
      }
    } catch (error) {
      showMessage(`テストエラー: ${error.message}`, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'テスト';
    }
  });

  function showMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
  }

  async function testApiKey(apiKey, model) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // APIテスト用の簡単なリクエスト
    const testPayload = {
      contents: [{
        parts: [{
          text: "Hello"
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 100
      }
    };
    
    console.log('Testing with payload:', JSON.stringify(testPayload, null, 2)); // デバッグ用

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload)
      });
      
      console.log('Test response status:', response.status); // デバッグ用
      
      if (response.ok) {
        const data = await response.json();
        console.log('Test response data:', JSON.stringify(data, null, 2)); // デバッグ用
        
        // 簡単なレスポンス検証
        if (data.candidates && data.candidates.length > 0) {
          return true;
        } else {
          console.warn('Test response has no candidates');
          return false;
        }
      } else {
        const errorData = await response.json();
        console.error('Test API error:', errorData);
        return false;
      }
    } catch (error) {
      return false;
    }
  }
});
