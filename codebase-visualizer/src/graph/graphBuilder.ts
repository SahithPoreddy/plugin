import { CodeNode, CodeEdge, CodeGraph, GraphMetadata } from '../types/types';

export class GraphBuilder {
  build(nodes: CodeNode[], edges: CodeEdge[], rootPath: string): CodeGraph {
    // Remove duplicates
    const uniqueNodes = this.deduplicateNodes(nodes);
    const uniqueEdges = this.deduplicateEdges(edges);

    // Build metadata
    const metadata: GraphMetadata = {
      totalFiles: new Set(uniqueNodes.map(n => n.filePath)).size,
      totalNodes: uniqueNodes.length,
      languages: [...new Set(uniqueNodes.map(n => n.language))],
      rootPath: rootPath,
      analyzedAt: new Date()
    };

    return {
      nodes: uniqueNodes,
      edges: uniqueEdges,
      metadata
    };
  }

  /**
   * Build graph with entry points as root nodes
   */
  buildFromEntryPoints(
    nodes: CodeNode[], 
    edges: CodeEdge[], 
    rootPath: string,
    entryPointFiles: string[]
  ): CodeGraph {
    // Remove duplicates
    const uniqueNodes = this.deduplicateNodes(nodes);
    const uniqueEdges = this.deduplicateEdges(edges);

    // Build metadata with entry point info
    const metadata: GraphMetadata = {
      totalFiles: new Set(uniqueNodes.map(n => n.filePath)).size,
      totalNodes: uniqueNodes.length,
      languages: [...new Set(uniqueNodes.map(n => n.language))],
      rootPath: rootPath,
      analyzedAt: new Date(),
      entryPoints: entryPointFiles
    };

    return {
      nodes: uniqueNodes,
      edges: uniqueEdges,
      metadata
    };
  }

  private deduplicateNodes(nodes: CodeNode[]): CodeNode[] {
    const seen = new Map<string, CodeNode>();
    nodes.forEach(node => {
      if (!seen.has(node.id)) {
        seen.set(node.id, node);
      }
    });
    return Array.from(seen.values());
  }

  private deduplicateEdges(edges: CodeEdge[]): CodeEdge[] {
    const seen = new Set<string>();
    return edges.filter(edge => {
      const key = `${edge.from}-${edge.to}-${edge.type}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Filter graph to show only specific depth from a root node
   */
  filterByDepth(graph: CodeGraph, rootNodeId: string, maxDepth: number): CodeGraph {
    const visited = new Set<string>();
    const nodesToInclude = new Set<string>();
    const edgesToInclude: CodeEdge[] = [];

    const traverse = (nodeId: string, depth: number) => {
      if (depth > maxDepth || visited.has(nodeId)) return;
      
      visited.add(nodeId);
      nodesToInclude.add(nodeId);

      // Find all edges from this node
      const outgoingEdges = graph.edges.filter(e => e.from === nodeId);
      outgoingEdges.forEach(edge => {
        edgesToInclude.push(edge);
        traverse(edge.to, depth + 1);
      });
    };

    traverse(rootNodeId, 0);

    return {
      nodes: graph.nodes.filter(n => nodesToInclude.has(n.id)),
      edges: edgesToInclude,
      metadata: { ...graph.metadata, totalNodes: nodesToInclude.size }
    };
  }

  /**
   * Get all dependencies of a node
   */
  getDependencies(graph: CodeGraph, nodeId: string): CodeNode[] {
    const depIds = graph.edges
      .filter(e => e.from === nodeId)
      .map(e => e.to);
    
    return graph.nodes.filter(n => depIds.includes(n.id));
  }

  /**
   * Get all nodes that depend on this node
   */
  getDependents(graph: CodeGraph, nodeId: string): CodeNode[] {
    const depIds = graph.edges
      .filter(e => e.to === nodeId)
      .map(e => e.from);
    
    return graph.nodes.filter(n => depIds.includes(n.id));
  }
}
