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
  node?: any;
  documentation?: string;
  dependencies?: string[];
  dependents?: string[];
}

interface AppState {
  nodes: any[];
  edges: any[];
  selectedNode: any | null;
  documentation: string;
  dependencies: string[];
  dependents: string[];
  persona: string;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    nodes: [],
    edges: [],
    selectedNode: null,
    documentation: '',
    dependencies: [],
    dependents: [],
    persona: 'developer',
  });

  const [queryText, setQueryText] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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
          // Reset expanded nodes when graph updates
          setExpandedNodes(new Set());
          break;

        case 'showNodeDetails':
          console.log('Received node details:', message);
          setState(prev => ({
            ...prev,
            selectedNode: message.node,
            documentation: message.documentation || '',
            dependencies: message.dependencies || [],
            dependents: message.dependents || [],
          }));
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

  const handleSendToCline = () => {
    if (state.selectedNode) {
      const message = `${queryText}\n\nContext:\nNode: ${state.selectedNode.label}\nType: ${state.selectedNode.type}\n\nDocumentation:\n${state.documentation}`;
      vscode.postMessage({
        command: 'sendToCline',
        message: message,
      });
    }
  };

  const handleOpenFile = (filePath: string) => {
    vscode.postMessage({
      command: 'openFile',
      filePath: filePath,
    });
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100%',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
    }}>
      {/* Main Graph Area */}
      <div style={{ flex: 1, position: 'relative' }}>
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
                💡 Click <span style={{ background: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>+</span> on nodes to expand dependencies
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

      {/* Side Panel */}
      {state.selectedNode && (
        <div style={{
          width: '350px',
          borderLeft: '1px solid #e5e7eb',
          background: '#f9fafb',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Node Details */}
          <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#1f2937' }}>
              {state.selectedNode.label}
            </h3>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
              Type: {state.selectedNode.type}
            </div>
            {state.selectedNode.filePath && (
              <button
                onClick={() => handleOpenFile(state.selectedNode.filePath)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Open File
              </button>
            )}
          </div>

          {/* Dependencies */}
          {state.dependencies && state.dependencies.length > 0 && (
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#374151' }}>
                Dependencies ({state.dependencies.length})
              </h4>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {state.dependencies.map((dep: any, i: number) => (
                  <div key={i} style={{ padding: '4px 0' }}>• {dep}</div>
                ))}
              </div>
            </div>
          )}

          {/* Dependents */}
          {state.dependents && state.dependents.length > 0 && (
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#374151' }}>
                Used By ({state.dependents.length})
              </h4>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {state.dependents.map((dep: any, i: number) => (
                  <div key={i} style={{ padding: '4px 0' }}>• {dep}</div>
                ))}
              </div>
            </div>
          )}

          {/* Documentation */}
          <div style={{ padding: '16px', flex: 1 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#374151' }}>
              Documentation
            </h4>
            <div style={{
              fontSize: '12px',
              color: '#6b7280',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
            }}>
              {state.documentation || 'No documentation available'}
            </div>
          </div>

          {/* Send to Cline */}
          <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb', background: '#ffffff' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#374151' }}>
              Ask Cline
            </h4>
            <textarea
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Enter your question..."
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                fontSize: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                marginBottom: '8px',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSendToCline}
              disabled={!queryText.trim()}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '13px',
                background: queryText.trim() ? '#10b981' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: queryText.trim() ? 'pointer' : 'not-allowed',
                fontWeight: '500',
              }}
            >
              Send to Cline
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
