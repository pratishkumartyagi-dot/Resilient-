// Boolean query parser and visualizer for systematic review queries
// Inspired by searchrefiner's query visualization approach

export interface QueryNode {
  id: string;
  type: 'term' | 'operator' | 'group';
  value: string;
  operator?: 'AND' | 'OR' | 'NOT';
  children?: QueryNode[];
  field?: string;
  mesh?: boolean;
}

export interface QueryTree {
  root: QueryNode;
  original: string;
  concepts: string[];
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function parseBooleanQuery(query: string): QueryTree {
  if (!query || query.trim() === '') {
    return {
      root: { id: generateId(), type: 'term', value: '' },
      original: query,
      concepts: []
    };
  }

  const cleaned = query.trim();
  const concepts: string[] = [];
  
  // Simple tokenizer for boolean operators
  // This is a basic parser - for complex nested queries, a more sophisticated parser would be needed
  const tokens = tokenizeQuery(cleaned);
  const root = buildTree(tokens);
  
  // Extract unique concepts (terms without operators/quotes context)
  extractConcepts(root, concepts);
  
  return {
    root,
    original: cleaned,
    concepts: Array.from(new Set(concepts.filter(c => c.length > 2)))
  };
}

function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let parenDepth = 0;
  
  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    
    if (char === '(' && !inQuotes) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = '';
      }
      tokens.push('(');
      parenDepth++;
      continue;
    }
    
    if (char === ')' && !inQuotes) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = '';
      }
      tokens.push(')');
      parenDepth--;
      continue;
    }
    
    if (/\s/.test(char) && !inQuotes) {
      if (current.trim()) {
        const trimmed = current.trim();
        // Check if it's a boolean operator
        if (/^(AND|OR|NOT)$/i.test(trimmed)) {
          tokens.push(trimmed.toUpperCase());
        } else {
          tokens.push(trimmed);
        }
        current = '';
      }
      continue;
    }
    
    current += char;
  }
  
  if (current.trim()) {
    const trimmed = current.trim();
    if (/^(AND|OR|NOT)$/i.test(trimmed)) {
      tokens.push(trimmed.toUpperCase());
    } else {
      tokens.push(trimmed);
    }
  }
  
  return tokens;
}

function buildTree(tokens: string[]): QueryNode {
  const result = parseExpression(tokens, 0);
  return result.node;
}

function parseExpression(tokens: string[], index: number): { node: QueryNode, newIndex: number } {
  // Parse term or parenthesized expression
  if (index >= tokens.length) {
    return { node: { id: generateId(), type: 'term', value: '' }, newIndex: index };
  }
  
  let left: QueryNode;
  if (tokens[index] === '(') {
    const result = parseExpression(tokens, index + 1);
    left = { id: generateId(), type: 'group', children: [result.node], value: '' };
    index = result.newIndex;
    if (index < tokens.length && tokens[index] === ')') {
      index++;
    }
  } else if (tokens[index] === 'NOT') {
    // Unary NOT
    const result = parseExpression(tokens, index + 1);
    left = { 
      id: generateId(), 
      type: 'operator', 
      operator: 'NOT', 
      value: 'NOT',
      children: [result.node]
    };
    index = result.newIndex;
    return parseOperator(tokens, index, left);
  } else {
    left = { id: generateId(), type: 'term', value: tokens[index] };
    index++;
  }
  
  return parseOperator(tokens, index, left);
}

function parseOperator(tokens: string[], index: number, left: QueryNode): { node: QueryNode, newIndex: number } {
  if (index >= tokens.length) {
    return { node: left, newIndex: index };
  }
  
  const op = tokens[index];
  if (op === 'AND' || op === 'OR') {
    index++;
    const rightResult = parseExpression(tokens, index);
    const node: QueryNode = {
      id: generateId(),
      type: 'operator',
      operator: op as 'AND' | 'OR',
      value: op,
      children: [left, rightResult.node]
    };
    return parseOperator(tokens, rightResult.newIndex, node);
  }
  
  return { node: left, newIndex: index };
}

function extractConcepts(node: QueryNode, concepts: string[]): void {
  if (node.type === 'term' && node.value) {
    // Remove quotes and field specifiers
    let term = node.value.replace(/"/g, '');
    // Remove field tags like [tiab], [Mesh], etc.
    term = term.replace(/\[.*?\]/g, '');
    if (term && !/^(AND|OR|NOT)$/.test(term)) {
      concepts.push(term.trim());
    }
  }
  if (node.children) {
    node.children.forEach(child => extractConcepts(child, concepts));
  }
}

export function getQueryComplexity(tree: QueryTree): {
  operators: number;
  terms: number;
  groups: number;
  hasNesting: boolean;
} {
  let operators = 0;
  let terms = 0;
  let groups = 0;
  let maxDepth = 0;
  
  function traverse(node: QueryNode, depth: number) {
    maxDepth = Math.max(maxDepth, depth);
    if (node.type === 'operator') operators++;
    if (node.type === 'term' && node.value) terms++;
    if (node.type === 'group') groups++;
    if (node.children) {
      node.children.forEach(child => traverse(child, depth + 1));
    }
  }
  
  traverse(tree.root, 0);
  
  return {
    operators,
    terms,
    groups,
    hasNesting: maxDepth > 2 || groups > 0
  };
}
