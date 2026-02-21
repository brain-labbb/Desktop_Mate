import React, { useState, useEffect } from 'react';
import './ModelSelector.css';

export interface ModelConfig {
  id: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

interface ModelSelectorProps {
  onModelChange: (model: ModelConfig) => void;
}

export default function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [newModel, setNewModel] = useState({
    provider: 'glm',
    model: 'glm-4',
    apiKey: '',
    baseUrl: ''
  });

  const selectedModel = models.find(m => m.id === selectedModelId);

  useEffect(() => {
    if (selectedModel) {
      onModelChange(selectedModel);
    }
  }, [selectedModelId, selectedModel, onModelChange]);

  const handleAddModel = () => {
    if (newModel.model) {
      const model: ModelConfig = {
        id: Date.now().toString(),
        provider: newModel.provider,
        model: newModel.model,
        ...(newModel.apiKey && { apiKey: newModel.apiKey }),
        ...(newModel.baseUrl && { baseUrl: newModel.baseUrl })
      };
      setModels([...models, model]);
      setSelectedModelId(model.id);
      setNewModel({ provider: 'glm', model: 'glm-4', apiKey: '', baseUrl: '' });
      setIsAddModalOpen(false);
    }
  };

  const handleDeleteModel = (modelId: string) => {
    const updatedModels = models.filter(m => m.id !== modelId);
    setModels(updatedModels);
    if (selectedModelId === modelId) {
      setSelectedModelId(updatedModels.length > 0 ? updatedModels[0].id : '');
    }
  };

  const getProviderLabel = (provider: string): string => {
    switch (provider) {
      case 'glm':
      case 'zhipu':
        return 'GLM (智谱AI)';
      case 'openai':
        return 'OpenAI';
      case 'anthropic':
        return 'Anthropic';
      case 'ollama':
        return 'Ollama';
      default:
        return provider;
    }
  };

  return (
    <div className="model-selector">
      <select
        value={selectedModelId}
        onChange={(e) => setSelectedModelId(e.target.value)}
        className="model-dropdown"
        title="当前选择的模型"
        disabled={models.length === 0}
      >
        {models.length === 0 ? (
          <option value="">暂无模型</option>
        ) : (
          models.map(model => (
            <option key={model.id} value={model.id}>
              {getProviderLabel(model.provider)} - {model.model}
            </option>
          ))
        )}
      </select>
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="add-model-btn"
        title="添加新模型"
      >
        +
      </button>
      {models.length > 0 && (
        <button
          onClick={() => setIsManageModalOpen(true)}
          className="manage-models-btn"
          title="管理模型"
        >
          ⚙
        </button>
      )}

      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>添加新模型</h3>
            <div className="form-group">
              <label>提供商</label>
              <select
                value={newModel.provider}
                onChange={(e) => setNewModel({ ...newModel, provider: e.target.value, model: e.target.value === 'glm' ? 'glm-4' : newModel.model })}
              >
                <option value="glm">GLM</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
            <div className="form-group">
              <label>模型名称</label>
              <input
                type="text"
                value={newModel.model}
                onChange={(e) => setNewModel({ ...newModel, model: e.target.value })}
                placeholder="例如: glm-4, gpt-4o"
              />
            </div>
            <div className="form-group">
              <label>API Key <span className="required">(必填)</span></label>
              <input
                type="password"
                value={newModel.apiKey}
                onChange={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
                placeholder="你的API key"
              />
            </div>
            <div className="form-group">
              <label>Base URL (可选)</label>
              <input
                type="text"
                value={newModel.baseUrl}
                onChange={(e) => setNewModel({ ...newModel, baseUrl: e.target.value })}
                placeholder="自定义 API 端点"
              />
              <small className="form-hint">留空使用默认端点</small>
            </div>
            <div className="modal-actions">
              <button onClick={() => setIsAddModalOpen(false)} className="cancel-btn">取消</button>
              <button
                onClick={handleAddModel}
                className="confirm-btn"
                disabled={!newModel.model || !newModel.apiKey}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {isManageModalOpen && (
        <div className="modal-overlay" onClick={() => setIsManageModalOpen(false)}>
          <div className="modal-content manage-modal" onClick={(e) => e.stopPropagation()}>
            <h3>管理模型</h3>
            {models.length === 0 ? (
              <p className="empty-models-hint">暂无模型，请先添加模型</p>
            ) : (
              <div className="models-list">
                {models.map(model => (
                  <div key={model.id} className="model-item">
                    <div className="model-info">
                      <span className="model-provider">{getProviderLabel(model.provider)}</span>
                      <span className="model-name">{model.model}</span>
                      {model.apiKey && (
                        <span className="model-api-key">••••{model.apiKey.slice(-4)}</span>
                      )}
                    </div>
                    <div className="model-actions">
                      {model.id !== selectedModelId && (
                        <button
                          onClick={() => {
                            setSelectedModelId(model.id);
                            setIsManageModalOpen(false);
                          }}
                          className="select-btn"
                          title="选择此模型"
                        >
                          选择
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        className="delete-btn"
                        title="删除模型"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button onClick={() => setIsManageModalOpen(false)} className="confirm-btn">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
