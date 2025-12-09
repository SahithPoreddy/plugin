import { CodeNode, Persona, Documentation } from '../types/types';

/**
 * Generates persona-specific documentation for code nodes
 */
export class DocumentationGenerator {
  /**
   * Generate documentation for a node based on persona
   */
  generateForNode(node: CodeNode, persona: Persona): string {
    const generator = this.getPersonaGenerator(persona);
    return generator(node);
  }

  /**
   * Enrich existing documentation with persona-specific content
   */
  enrichDocumentation(node: CodeNode): CodeNode {
    const enriched = { ...node };
    
    if (!enriched.documentation) {
      enriched.documentation = {
        summary: `${node.type} ${node.label}`,
        description: '',
        persona: {} as Record<Persona, string>
      };
    }

    // Generate for each persona
    enriched.documentation.persona = {
      'developer': this.generateDeveloperDoc(node),
      'product-manager': this.generateProductManagerDoc(node),
      'architect': this.generateArchitectDoc(node),
      'business-analyst': this.generateBusinessAnalystDoc(node)
    };

    return enriched;
  }

  private getPersonaGenerator(persona: Persona): (node: CodeNode) => string {
    const generators = {
      'developer': this.generateDeveloperDoc.bind(this),
      'product-manager': this.generateProductManagerDoc.bind(this),
      'architect': this.generateArchitectDoc.bind(this),
      'business-analyst': this.generateBusinessAnalystDoc.bind(this)
    };
    return generators[persona];
  }

  /**
   * Developer Persona: Technical, implementation-focused
   */
  private generateDeveloperDoc(node: CodeNode): string {
    const sections: string[] = [];

    sections.push(`📦 ${node.label}`);
    sections.push('');
    
    // File location
    const fileName = node.filePath.split(/[\\/]/).pop() || node.filePath;
    sections.push(`📁 File: ${fileName}`);
    sections.push(`📍 Lines: ${node.startLine} - ${node.endLine}`);
    sections.push(`🏷️ Type: ${node.type}`);
    sections.push(`💻 Language: ${node.language}`);
    sections.push('');

    // Technical details
    const details: string[] = [];
    if (node.visibility) {
      details.push(`${node.visibility}`);
    }
    if (node.isAsync) {
      details.push('async');
    }
    if (node.isStatic) {
      details.push('static');
    }
    if (details.length > 0) {
      sections.push(`⚙️ Modifiers: ${details.join(', ')}`);
      sections.push('');
    }

    // Parameters
    if (node.parameters && node.parameters.length > 0) {
      sections.push('');
      sections.push('### Parameters');
      node.parameters.forEach(param => {
        sections.push(`- \`${param.name}\`: ${param.type}${param.optional ? ' (optional)' : ''}`);
      });
    }

    // Return type
    if (node.returnType) {
      sections.push('');
      sections.push(`### Returns`);
      sections.push(`\`${node.returnType}\``);
    }

    // For React components
    if (node.type === 'component') {
      if (node.props && node.props.length > 0) {
        sections.push('');
        sections.push('### Props');
        node.props.forEach(prop => {
          sections.push(`- ${prop}`);
        });
      }
      if (node.hooks && node.hooks.length > 0) {
        sections.push('');
        sections.push('### Hooks Used');
        node.hooks.forEach(hook => {
          sections.push(`- ${hook}`);
        });
      }
    }

    // Source code preview
    if (node.sourceCode) {
      sections.push('');
      sections.push('📝 Code Preview:');
      // Show first 15 lines of source code
      const codeLines = node.sourceCode.split('\n').slice(0, 15);
      if (codeLines.length > 0) {
        sections.push('```' + node.language);
        sections.push(codeLines.join('\n'));
        if (node.sourceCode.split('\n').length > 15) {
          sections.push('// ... (truncated)');
        }
        sections.push('```');
      }
    }

    // Smart summary based on code analysis
    sections.push('');
    sections.push('📋 Summary:');
    sections.push(this.generateSmartSummary(node));

    return sections.join('\n');
  }

  private generateSmartSummary(node: CodeNode): string {
    const summaryParts: string[] = [];
    
    if (node.type === 'component') {
      summaryParts.push(`This is a React component that renders UI for ${this.humanizeName(node.label)}.`);
      if (node.props && node.props.length > 0) {
        summaryParts.push(`It accepts ${node.props.length} prop(s): ${node.props.slice(0, 5).join(', ')}${node.props.length > 5 ? '...' : ''}.`);
      }
      if (node.hooks && node.hooks.length > 0) {
        summaryParts.push(`Uses hooks: ${node.hooks.join(', ')}.`);
      }
    } else if (node.type === 'class') {
      summaryParts.push(`A ${node.language} class that encapsulates ${this.humanizeName(node.label)} functionality.`);
    } else if (node.type === 'function' || node.type === 'method') {
      const paramInfo = node.parameters && node.parameters.length > 0 
        ? `Takes ${node.parameters.length} parameter(s): ${node.parameters.map(p => p.name).join(', ')}.`
        : 'Takes no parameters.';
      const returnInfo = node.returnType ? `Returns: ${node.returnType}.` : '';
      summaryParts.push(`A ${node.isAsync ? 'async ' : ''}${node.type} that handles ${this.humanizeName(node.label)}.`);
      summaryParts.push(paramInfo);
      if (returnInfo) summaryParts.push(returnInfo);
    } else {
      summaryParts.push(`This ${node.type} implements ${this.humanizeName(node.label)} logic.`);
    }

    // Analyze source code for additional insights
    if (node.sourceCode) {
      const code = node.sourceCode;
      const insights: string[] = [];
      
      // Check for common patterns
      if (code.includes('fetch(') || code.includes('axios') || code.includes('http')) {
        insights.push('Makes HTTP requests');
      }
      if (code.includes('useState') || code.includes('setState')) {
        insights.push('Manages state');
      }
      if (code.includes('useEffect') || code.includes('componentDidMount')) {
        insights.push('Has side effects/lifecycle');
      }
      if (code.includes('async ') || code.includes('await ') || code.includes('.then(')) {
        insights.push('Uses async operations');
      }
      if (code.includes('try') && code.includes('catch')) {
        insights.push('Has error handling');
      }
      if (code.includes('localStorage') || code.includes('sessionStorage')) {
        insights.push('Uses browser storage');
      }
      if (code.includes('dispatch') || code.includes('useReducer') || code.includes('Redux')) {
        insights.push('Uses state management');
      }
      
      if (insights.length > 0) {
        summaryParts.push('');
        summaryParts.push('🔍 Key patterns detected: ' + insights.join(', ') + '.');
      }
    }

    return summaryParts.join(' ');
  }

  /**
   * Product Manager Persona: Business value, features
   */
  private generateProductManagerDoc(node: CodeNode): string {
    const sections: string[] = [];

    sections.push(`## ${node.label}`);
    sections.push('');

    // Business context
    sections.push('### What It Does');
    sections.push(this.extractBusinessPurpose(node));
    sections.push('');

    // User impact
    sections.push('### User Impact');
    sections.push(this.generateUserImpact(node));
    sections.push('');

    // Features
    sections.push('### Features');
    sections.push(this.listFeatures(node));

    return sections.join('\n');
  }

  /**
   * Architect Persona: Design patterns, architecture
   */
  private generateArchitectDoc(node: CodeNode): string {
    const sections: string[] = [];

    sections.push(`## ${node.label}`);
    sections.push('');

    // Architectural role
    sections.push('### Architectural Role');
    sections.push(this.describeArchitecturalRole(node));
    sections.push('');

    // Design patterns
    sections.push('### Design Patterns');
    sections.push(this.identifyDesignPatterns(node));
    sections.push('');

    // Dependencies
    sections.push('### Architecture Considerations');
    sections.push(this.generateArchitectureNotes(node));

    return sections.join('\n');
  }

  /**
   * Business Analyst Persona: Process, requirements
   */
  private generateBusinessAnalystDoc(node: CodeNode): string {
    const sections: string[] = [];

    sections.push(`## ${node.label}`);
    sections.push('');

    // Business process
    sections.push('### Business Process');
    sections.push(this.describeBusinessProcess(node));
    sections.push('');

    // Requirements
    sections.push('### Requirements Addressed');
    sections.push(this.listRequirements(node));
    sections.push('');

    // Business rules
    sections.push('### Business Rules');
    sections.push(this.extractBusinessRules(node));

    return sections.join('\n');
  }

  // Helper methods for content generation
  
  private generateImplementationNotes(node: CodeNode): string {
    const notes: string[] = [];
    
    if (node.type === 'class') {
      notes.push('This class encapsulates related functionality and data.');
    } else if (node.type === 'function' || node.type === 'method') {
      notes.push('This function performs a specific operation and returns a result.');
    } else if (node.type === 'component') {
      notes.push('This React component renders UI elements and manages its state.');
    }

    // Add language-specific notes
    if (node.language === 'java') {
      notes.push('Written in Java, following object-oriented principles.');
    } else if (node.language === 'typescript' || node.language === 'javascript') {
      notes.push('Implemented using modern JavaScript/TypeScript features.');
    }

    return notes.join(' ');
  }

  private extractBusinessPurpose(node: CodeNode): string {
    const purposes: Record<string, string> = {
      'class': `The ${node.label} class provides business logic for ${this.humanizeName(node.label)}.`,
      'function': `This function enables ${this.humanizeName(node.label)} functionality.`,
      'method': `This method handles ${this.humanizeName(node.label)} operations.`,
      'component': `This component displays ${this.humanizeName(node.label)} to users.`
    };
    
    return purposes[node.type] || `This ${node.type} implements ${this.humanizeName(node.label)}.`;
  }

  private generateUserImpact(node: CodeNode): string {
    if (node.type === 'component') {
      return `Users interact with this component as part of the user interface. It affects the user experience by providing ${this.humanizeName(node.label)} functionality.`;
    }
    return `This component indirectly impacts users by ensuring ${this.humanizeName(node.label)} works correctly.`;
  }

  private listFeatures(node: CodeNode): string {
    const features: string[] = [];
    
    if (node.parameters && node.parameters.length > 0) {
      features.push(`- Accepts ${node.parameters.length} input parameter(s)`);
    }
    if (node.returnType) {
      features.push(`- Returns ${node.returnType} data`);
    }
    if (node.type === 'component' && node.props) {
      features.push(`- Configurable with ${node.props.length} prop(s)`);
    }

    return features.length > 0 ? features.join('\n') : '- Core functionality implementation';
  }

  private describeArchitecturalRole(node: CodeNode): string {
    const roles: Record<string, string> = {
      'class': 'Serves as a reusable module encapsulating business logic and data structures.',
      'component': 'Acts as a UI layer component in the presentation tier.',
      'function': 'Provides a utility or service function used across the application.',
      'method': 'Implements specific behavior as part of a larger class structure.'
    };
    
    return roles[node.type] || 'Contributes to the overall system architecture.';
  }

  private identifyDesignPatterns(node: CodeNode): string {
    const patterns: string[] = [];
    
    // Simple heuristics for pattern detection
    if (node.label.includes('Factory')) {
      patterns.push('- **Factory Pattern**: Creates objects without specifying exact classes');
    }
    if (node.label.includes('Builder')) {
      patterns.push('- **Builder Pattern**: Constructs complex objects step by step');
    }
    if (node.label.includes('Singleton')) {
      patterns.push('- **Singleton Pattern**: Ensures single instance exists');
    }
    if (node.type === 'component' && node.label.includes('Provider')) {
      patterns.push('- **Provider Pattern**: Provides data/functionality to child components');
    }

    return patterns.length > 0 ? patterns.join('\n') : '- Standard implementation pattern';
  }

  private generateArchitectureNotes(node: CodeNode): string {
    return `This ${node.type} follows ${node.language} best practices and integrates with the overall system architecture. It maintains separation of concerns and can be tested independently.`;
  }

  private describeBusinessProcess(node: CodeNode): string {
    return `This component is part of the ${this.humanizeName(node.label)} business process. It handles specific workflow steps that contribute to the overall business objective.`;
  }

  private listRequirements(node: CodeNode): string {
    return `- Implements ${this.humanizeName(node.label)} functionality as specified\n- Ensures data integrity and business rule compliance\n- Provides necessary inputs/outputs for the business process`;
  }

  private extractBusinessRules(node: CodeNode): string {
    return `Business rules are enforced through validation logic and constraints implemented in this ${node.type}. The implementation ensures compliance with business requirements.`;
  }

  private humanizeName(name: string): string {
    // Convert camelCase or PascalCase to human-readable text
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
      .toLowerCase();
  }
}
