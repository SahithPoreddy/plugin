import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

// CodeNode and CodeEdge types
interface CodeNode {
  id: string;
  label: string;
  type: string;
  language: string;
  filePath: string;
  startLine: number;
  endLine: number;
  isEntryPoint?: boolean;
  sourceCode: string;
}

interface CodeEdge {
  from: string;
  to: string;
  type: string;
  label?: string;
}

interface CodeFlowProps {
  nodes: CodeNode[];
  edges: CodeEdge[];
  onNodeClick: (nodeId: string) => void;
  expandedNodes: Set<string>;
  onExpandedNodesChange: (nodes: Set<string>) => void;
}

export const CodeFlow: React.FC<CodeFlowProps> = ({ nodes, edges, onNodeClick, expandedNodes, onExpandedNodesChange }) => {
  console.log('CodeFlow rendering with:', { 
    nodesCount: nodes.length, 
    edgesCount: edges.length,
    sampleEdges: edges.slice(0, 5).map(e => ({ from: e.from, to: e.to, type: e.type })),
    nodeIds: nodes.map(n => n.id).slice(0, 5)
  });
  
  console.log('🔍 First node details:', nodes[0] ? {
    id: nodes[0].id,
    filePath: nodes[0].filePath,
    label: nodes[0].label
  } : 'No nodes');
  
  console.log('🔍 Edge analysis:', {
    totalEdges: edges.length,
    edgesFromApp: edges.filter(e => e.from.includes('App.tsx')).length,
    edgesToApp: edges.filter(e => e.to.includes('App.tsx')).length,
    sampleFrom: edges.slice(0, 3).map(e => e.from),
    sampleTo: edges.slice(0, 3).map(e => e.to)
  });
  
  // Use the expandedNodes from props
  const setExpandedNodes = onExpandedNodesChange;
  
  // Get children for each node - by matching node's filePath with edge's from
  const getChildNodes = useCallback((nodeId: string): string[] => {
    // Find the node object to get its filePath
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      console.log(`❌ Node not found for id: ${nodeId}`);
      return [];
    }
    
    const nodeFilePath = node.filePath;
    
    console.log(`🔍 getChildNodes called for:`, {
      nodeId: nodeId.substring(0, 60),
      nodeFilePath: nodeFilePath,
      totalEdges: edges.length,
    });
    
    // Find all edges where 'from' matches the node's file path
    const matchingEdges = edges.filter(e => e.from === nodeFilePath);
    
    console.log(`📊 Matching edges:`, {
      matchCount: matchingEdges.length,
      sampleTargets: matchingEdges.slice(0, 3).map(e => e.to)
    });
    
    // Map edge targets to node IDs
    const childIds = matchingEdges.map(e => {
      // Find the node that has this file path
      const targetNode = nodes.find(n => n.filePath === e.to);
      return targetNode ? targetNode.id : null;
    }).filter((id): id is string => id !== null);
    
    console.log(`✅ Final children for "${node.label}":`, {
      count: childIds.length,
      sample: childIds.slice(0, 3).map(id => nodes.find(n => n.id === id)?.label)
    });
    
    return childIds;
  }, [edges, nodes]);
  
  // Get parent nodes - by matching node's filePath with edge's to
  const getParentNodes = useCallback((nodeId: string): string[] => {
    // Find the node object to get its filePath
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return [];
    
    const nodeFilePath = node.filePath;
    
    // Find all edges where 'to' matches the node's file path
    return edges
      .filter(e => e.to === nodeFilePath)
      .map(e => {
        // Find the node that has this file path as 'from'
        const sourceNode = nodes.find(n => n.filePath === e.from);
        return sourceNode ? sourceNode.id : null;
      })
      .filter((id): id is string => id !== null);
  }, [edges, nodes]);
  
  // Determine which nodes should be visible
  const visibleNodeIds = useMemo(() => {
    const visible = new Set<string>();
    
    // ONLY add entry point nodes initially (not all root nodes)
    const entryPoints = nodes.filter(n => n.isEntryPoint);
    
    // If no entry points detected, show nodes with no parents as fallback
    if (entryPoints.length === 0) {
      nodes.forEach(node => {
        const parents = getParentNodes(node.id);
        if (parents.length === 0) {
          visible.add(node.id);
        }
      });
    } else {
      entryPoints.forEach(n => visible.add(n.id));
    }
    
    // Add children of expanded nodes recursively
    const addChildren = (nodeId: string) => {
      if (expandedNodes.has(nodeId)) {
        const children = getChildNodes(nodeId);
        children.forEach(childId => {
          visible.add(childId);
          addChildren(childId); // Recursive for nested expansions
        });
      }
    };
    
    // Start from visible root/entry nodes
    Array.from(visible).forEach(nodeId => addChildren(nodeId));
    
    console.log('Visibility:', { totalNodes: nodes.length, visibleNodes: visible.size, entryPoints: entryPoints.length, expanded: expandedNodes.size });
    
    return visible;
  }, [nodes, expandedNodes, getChildNodes, getParentNodes]);
  
  // Convert CodeNode to ReactFlow Node
  const flowNodes: Node[] = useMemo(() => {
    console.log('Converting nodes:', nodes.length, 'visible:', visibleNodeIds.size);
    
    // Filter to only visible nodes
    const visibleNodes = nodes.filter(n => visibleNodeIds.has(n.id));
    
    return visibleNodes.map((node, index) => {
      const isEntryPoint = node.isEntryPoint || false;
      const children = getChildNodes(node.id);
      const hasChildren = children.length > 0;
      const isExpanded = expandedNodes.has(node.id);
      
      console.log(`Node "${node.label}" (${node.id}):`, {
        hasChildren,
        childrenCount: children.length,
        children: children.slice(0, 3),
        isExpanded,
        willRenderButton: hasChildren
      });
      
      if (hasChildren) {
        console.log(`✅ WILL RENDER + BUTTON for "${node.label}" with ${children.length} children`);
      }
      
      const col = index % 4;
      const row = Math.floor(index / 4);
      
      return {
        id: node.id,
        type: 'default',
        position: { x: col * 250, y: row * 150 }, // Grid layout
        data: { 
          label: (
            <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'visible !important' }}>
              <div style={{ padding: '8px', textAlign: 'center', paddingBottom: hasChildren ? '20px' : '8px' }}>
                {isEntryPoint && <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 'bold' }}>⭐ ENTRY</div>}
                <div style={{ fontWeight: '600', marginBottom: '2px' }}>{node.label}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>{node.type}</div>
                {hasChildren && (
                  <div 
                    style={{ 
                      marginTop: '8px',
                      display: 'inline-block',
                      cursor: 'pointer',
                      background: isExpanded ? '#dc2626' : '#2563eb',
                      color: 'white',
                      border: '3px solid white',
                      borderRadius: '50%',
                      width: '36px',
                      height: '36px',
                      lineHeight: '30px',
                      textAlign: 'center',
                      fontSize: '24px',
                      fontWeight: '900',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      transition: 'all 0.2s ease',
                      userSelect: 'none',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.15)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const newSet = new Set(expandedNodes);
                      if (isExpanded) {
                        newSet.delete(node.id);
                      } else {
                        newSet.add(node.id);
                      }
                      console.log('🔘 Toggle expand:', node.id, 'expanded:', !isExpanded, 'children:', children.length);
                      setExpandedNodes(newSet);
                    }}
                    title={isExpanded ? `Collapse (hide ${children.length} dependencies)` : `Expand (show ${children.length} dependencies)`}
                  >
                    {isExpanded ? '−' : '+'}
                  </div>
                )}
              </div>
            </div>
          ),
          codeNode: node,
          hasChildren
        },
        style: {
          background: isEntryPoint ? '#dcfce7' : getNodeColor(node.type),
          border: isEntryPoint ? '3px solid #16a34a' : hasChildren ? '3px solid #2563eb' : '1px solid #d1d5db',
          borderRadius: '8px',
          padding: 0,
          fontSize: '13px',
          width: 180,
          boxShadow: isEntryPoint ? '0 4px 6px rgba(22, 163, 74, 0.2)' : '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'visible',
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      };
    });
  }, [nodes, visibleNodeIds, expandedNodes, getChildNodes]);

  // Convert CodeEdge to ReactFlow Edge (only for visible nodes)
  const flowEdges: Edge[] = useMemo(() => {
    // Filter edges to only include connections between visible nodes
    const visibleEdges = edges.filter(edge => 
      visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
    );
    
    return visibleEdges.map((edge, index) => ({
      id: `${edge.from}-${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      label: edge.type,
      type: 'default',  // Use default for straighter lines
      animated: edge.type === 'imports',
      style: { 
        stroke: getEdgeColor(edge.type),
        strokeWidth: 3,  // Thicker lines
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: getEdgeColor(edge.type),
        width: 20,
        height: 20,
      },
      labelStyle: {
        fontSize: 11,
        fill: '#1e293b',
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: '#ffffff',
        fillOpacity: 0.9,
        rx: 4,
        ry: 4,
      },
    }));
  }, [edges, visibleNodeIds]);

  const [nodesState, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Update nodes and edges when props change
  React.useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  React.useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const codeNode = node.data.codeNode as CodeNode;
      if (codeNode) {
        onNodeClick(codeNode.id);
      }
    },
    [onNodeClick]
  );

  return (
    <div style={{ width: '100%', height: '100%', background: '#ffffff' }}>
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        attributionPosition="bottom-left"
        defaultEdgeOptions={{
          type: 'default',
          animated: false,
        }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background color="#f0f0f0" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const codeNode = node.data.codeNode as CodeNode;
            return codeNode?.isEntryPoint ? '#16a34a' : '#94a3b8';
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
};

function getNodeColor(type: string): string {
  const colors: Record<string, string> = {
    class: '#dbeafe',      // blue
    function: '#dcfce7',    // green
    method: '#fef3c7',      // yellow
    component: '#fed7aa',   // orange
    module: '#e9d5ff',      // purple
    interface: '#d1fae5',   // emerald
  };
  return colors[type] || '#f1f5f9';
}

function getEdgeColor(type: string): string {
  const colors: Record<string, string> = {
    calls: '#1e293b',        // Very dark blue-gray
    extends: '#1e40af',      // Dark blue
    implements: '#065f46',   // Dark green
    imports: '#581c87',      // Dark purple
    uses: '#4338ca',         // Dark indigo
    contains: '#374151',     // Dark gray
  };
  return colors[type] || '#1e293b';
}
