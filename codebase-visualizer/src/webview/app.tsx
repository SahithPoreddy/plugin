import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { CodeFlow } from './components/CodeFlow';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';

// VS Code API types
declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

interface VSCodeMessage {
  command: string;
  graph?: any;
  data?: PopupData;
}

interface PopupData {
  name: string;
  type: string;
  summary: string;
  details: string;
  dependencies: string[];
  dependents: string[];
  patterns: string[];
  filePath: string;
  sourcePreview: string;
}

interface AppState {
  nodes: any[];
  edges: any[];
  popupData: PopupData | null;
  showPopup: boolean;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    nodes: [],
    edges: [],
    popupData: null,
    showPopup: false,
  });

  const [queryText, setQueryText] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'summary' | 'code' | 'deps'>('summary');

  useEffect(() => {
    console.log('Webview app mounted, sending ready signal...');
    
    // Signal to extension that webview is ready
    vscode.postMessage({ command: 'webviewReady' });
    
    // Handle messages from extension
    const handleMessage = (event: MessageEvent<VSCodeMessage>) => {
      const message = event.data;
      console.log('Received message:', message.command, message);

      switch (message.command) {
        case 'updateGraph':
          console.log('✅ Received graph update:', { 
            nodesCount: message.graph?.nodes?.length || 0, 
            edgesCount: message.graph?.edges?.length || 0 
          });
          setState(prev => ({
            ...prev,
            nodes: message.graph?.nodes || [],
            edges: message.graph?.edges || [],
          }));
          setExpandedNodes(new Set());
          break;

        case 'showPopup':
          console.log('Received popup data:', message.data);
          setState(prev => ({
            ...prev,
            popupData: message.data || null,
            showPopup: true,
          }));
          setActiveTab('summary');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleNodeClick = (nodeId: string) => {
    console.log('Node clicked:', nodeId);
    vscode.postMessage({
      command: 'nodeClicked',
      nodeId: nodeId,
    });
  };

  const handleClosePopup = () => {
    setState(prev => ({ ...prev, showPopup: false }));
  };

  const handleOpenFile = (filePath: string) => {
    vscode.postMessage({
      command: 'openFile',
      filePath: filePath,
    });
  };

  const handleSendToCline = () => {
    if (state.popupData && queryText.trim()) {
      vscode.postMessage({
        command: 'sendToCline',
        message: `${queryText}\n\nContext:\nComponent: ${state.popupData.name}\nType: ${state.popupData.type}\n\nSummary:\n${state.popupData.summary}`,
      });
      setQueryText('');
    }
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Close popup on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.showPopup) {
        handleClosePopup();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.showPopup]);

  return (
    <div style={{
      height: '100vh',
      width: '100%',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Main Graph Area */}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <ReactFlowProvider>
          {state.nodes.length === 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: '10px',
              color: '#64748b',
              fontSize: '14px',
            }}>
              <div style={{ fontSize: '48px' }}>📊</div>
              <div style={{ fontWeight: '500' }}>No code nodes found</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Make sure your workspace contains Java or TypeScript/React files
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                zIndex: 999,
                background: '#eff6ff',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #3b82f6',
                fontSize: '12px',
                color: '#1e40af',
                fontWeight: '500',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}>
                💡 Click nodes for details • Click <span style={{ background: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>+</span> to expand
              </div>
              
              {expandedNodes.size > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  zIndex: 999,
                }}>
                  <button
                    onClick={handleCollapseAll}
                    style={{
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                  >
                    ⊗ Collapse All ({expandedNodes.size})
                  </button>
                </div>
              )}
              
              <CodeFlow
                nodes={state.nodes}
                edges={state.edges}
                onNodeClick={handleNodeClick}
                expandedNodes={expandedNodes}
                onExpandedNodesChange={setExpandedNodes}
              />
            </div>
          )}
        </ReactFlowProvider>
      </div>

      {/* Popup Modal Overlay */}
      {state.showPopup && state.popupData && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(4px)',
          }}
          onClick={handleClosePopup}
        >
          {/* Popup Card */}
          <div 
            style={{
              width: '700px',
              maxWidth: '90vw',
              maxHeight: '85vh',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'popupIn 0.2s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '24px',
              color: 'white',
              position: 'relative',
            }}>
              <button
                onClick={handleClosePopup}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  color: 'white',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              >
                ✕
              </button>
              
              <h2 style={{ 
                margin: 0, 
                fontSize: '24px', 
                fontWeight: '700',
                marginBottom: '8px',
              }}>
                {state.popupData.name}
              </h2>
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <span style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '16px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                }}>
                  {state.popupData.type}
                </span>
                {state.popupData.patterns.slice(0, 3).map((pattern, i) => (
                  <span key={i} style={{
                    padding: '4px 12px',
                    fontSize: '11px',
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: '16px',
                  }}>
                    {pattern}
                  </span>
                ))}
              </div>
              
              <button
                onClick={() => handleOpenFile(state.popupData!.filePath)}
                style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  background: 'rgba(255,255,255,0.95)',
                  color: '#6b46c1',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                📂 Open in Editor
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid #e5e7eb',
              background: '#f9fafb',
            }}>
              {[
                { id: 'summary', label: '📋 Summary', icon: '📋' },
                { id: 'code', label: '📝 Signature', icon: '📝' },
                { id: 'deps', label: '🔗 Dependencies', icon: '🔗' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    border: 'none',
                    background: activeTab === tab.id ? '#ffffff' : 'transparent',
                    borderBottom: activeTab === tab.id ? '3px solid #667eea' : '3px solid transparent',
                    cursor: 'pointer',
                    fontWeight: activeTab === tab.id ? '600' : '500',
                    color: activeTab === tab.id ? '#667eea' : '#6b7280',
                    fontSize: '14px',
                    transition: 'all 0.2s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
            }}>
              {activeTab === 'summary' && (
                <div>
                  <div style={{
                    fontSize: '14px',
                    lineHeight: '1.7',
                    color: '#374151',
                    whiteSpace: 'pre-wrap',
                    marginBottom: '20px',
                  }}>
                    {state.popupData.summary}
                  </div>
                  
                  <div style={{
                    padding: '16px',
                    background: '#f3f4f6',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#4b5563',
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                      📍 Location Details
                    </div>
                    <pre style={{ margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {state.popupData.details}
                    </pre>
                  </div>

                  {state.popupData.patterns.length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '12px', color: '#374151' }}>
                        🔍 Detected Patterns
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {state.popupData.patterns.map((pattern, i) => (
                          <span key={i} style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            background: '#dbeafe',
                            color: '#1e40af',
                            borderRadius: '16px',
                            fontWeight: '500',
                          }}>
                            {pattern}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'code' && (
                <div>
                  <div style={{ marginBottom: '16px', color: '#6b7280', fontSize: '13px' }}>
                    Function signature showing input parameters and return type:
                  </div>
                  <div style={{
                    background: '#1e293b',
                    borderRadius: '8px',
                    padding: '20px',
                    overflow: 'auto',
                  }}>
                    <pre style={{
                      margin: 0,
                      color: '#a5d6ff',
                      fontFamily: '"Fira Code", "Consolas", monospace',
                      fontSize: '15px',
                      lineHeight: '1.8',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {state.popupData.sourcePreview || 'No signature available'}
                    </pre>
                  </div>
                </div>
              )}

              {activeTab === 'deps' && (
                <div style={{ display: 'flex', gap: '20px' }}>
                  {/* Dependencies */}
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: '600', 
                      marginBottom: '12px', 
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span>📤</span> Imports ({state.popupData.dependencies.length})
                    </div>
                    {state.popupData.dependencies.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {state.popupData.dependencies.map((dep, i) => (
                          <div key={i} style={{
                            padding: '10px 14px',
                            background: '#dbeafe',
                            borderRadius: '8px',
                            fontSize: '13px',
                            color: '#1e40af',
                            fontWeight: '500',
                          }}>
                            → {dep}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: '#9ca3af', fontSize: '13px' }}>No dependencies</div>
                    )}
                  </div>

                  {/* Dependents */}
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: '600', 
                      marginBottom: '12px', 
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span>📥</span> Used By ({state.popupData.dependents.length})
                    </div>
                    {state.popupData.dependents.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {state.popupData.dependents.map((dep, i) => (
                          <div key={i} style={{
                            padding: '10px 14px',
                            background: '#dcfce7',
                            borderRadius: '8px',
                            fontSize: '13px',
                            color: '#166534',
                            fontWeight: '500',
                          }}>
                            ← {dep}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: '#9ca3af', fontSize: '13px' }}>Not used by other components</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Ask Cline Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid #e5e7eb',
              background: '#f9fafb',
            }}>
              <div style={{ 
                display: 'flex', 
                gap: '12px',
                alignItems: 'center',
              }}>
                <input
                  type="text"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Ask Cline about this component..."
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontSize: '14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    outline: 'none',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && queryText.trim()) {
                      handleSendToCline();
                    }
                  }}
                />
                <button
                  onClick={handleSendToCline}
                  disabled={!queryText.trim()}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    background: queryText.trim() ? '#10b981' : '#d1d5db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: queryText.trim() ? 'pointer' : 'not-allowed',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🚀 Send to Cline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes popupIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
