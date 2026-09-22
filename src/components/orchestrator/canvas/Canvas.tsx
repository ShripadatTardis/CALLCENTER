import React, { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  Connection,
  useNodesState,
  useEdgesState,
  NodeTypes,
  EdgeTypes,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  StartNode,
  EndNode,
  ListenNode,
  IntentRouterNode,
  KBAnswerNode,
  ProductLookupNode,
  AuthenticationNode,
  APICallNode,
  ConditionNode,
  ComposeReplyNode,
  CollectDTMFNode,
  HumanEscalationNode,
} from './nodes';
import { CustomEdge } from './edges/CustomEdge';
import { validateFlow, ValidationError } from '@/utils/flowValidation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface CanvasProps {
  zoom: number;
  onNodeSelect: (nodeId: string | null) => void;
  onNodesChange?: (nodes: Node[]) => void;
  onEdgesChange?: (edges: Edge[]) => void;
  flowId?: string;
}

const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  listen: ListenNode,
  intent_router: IntentRouterNode,
  kb_answer: KBAnswerNode,
  product_lookup: ProductLookupNode,
  authentication: AuthenticationNode,
  api_call: APICallNode,
  condition: ConditionNode,
  compose_reply: ComposeReplyNode,
  collect_dtmf: CollectDTMFNode,
  human_escalation: HumanEscalationNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

const getInitialFlowData = (flowId?: string): { nodes: Node[]; edges: Edge[] } => {
  if (flowId === '4') {
    // Inbound Call Handling (Ava) - Optimized vertical layout
    return {
      nodes: [
        // Phase 1: Greeting & Intent Detection (Top center)
        { id: 'n1', type: 'start', position: { x: 600, y: 50 }, data: { label: 'Welcome Customer', type: 'start', config: { greeting: 'Hello! This is Ava from GT Bank. How may I assist you today?' } } },
        { id: 'n2', type: 'listen', position: { x: 600, y: 180 }, data: { label: 'Capture Intent', type: 'listen', config: { intents: ['transaction_dispute', 'fund_transfer', 'account_inquiry', 'savings_account', 'atm_branch', 'forex_inquiry', 'portfolio_query', 'wait_pause'], timeout: 8000 } } },
        { id: 'n3', type: 'intent_router', position: { x: 600, y: 310 }, data: { label: 'Route by Intent', type: 'intent_router', config: { intents: ['Transaction Dispute', 'Fund Transfer', 'Savings Account', 'ATM/Branch', 'Forex', 'Portfolio', 'Wait/Pause', 'Fallback'] } } },
        
        // Wait/Pause Handler (Top right side)
        { id: 'n4', type: 'compose_reply', position: { x: 1100, y: 460 }, data: { label: 'Acknowledge Wait', type: 'compose_reply', config: { message: 'Of course, take your time. I\'ll wait.' } } },
        { id: 'n5', type: 'listen', position: { x: 1100, y: 580 }, data: { label: 'Silent Listen', type: 'listen', config: { timeout: 30000, silentMode: true } } },
        
        // 6 Parallel Paths Below Intent Router
        
        // Path A: Transaction Dispute (Leftmost - x: 50-350)
        { id: 'n6', type: 'compose_reply', position: { x: 50, y: 500 }, data: { label: 'Request Transaction Details', type: 'compose_reply', config: { message: 'I\'d be happy to look into that for you. Could you please share the amount and date of the transaction you\'re concerned about?' } } },
        { id: 'n7', type: 'listen', position: { x: 50, y: 620 }, data: { label: 'Capture Details', type: 'listen', config: { entities: ['amount', 'date'] } } },
        { id: 'n8', type: 'authentication', position: { x: 50, y: 740 }, data: { label: 'Verify Customer', type: 'authentication', config: { method: 'account_otp', message: 'Thank you. For security, may I have the last five digits of your account number?' } } },
        { id: 'n9', type: 'api_call', position: { x: 50, y: 860 }, data: { label: 'Fetch Transaction', type: 'api_call', config: { endpoint: '/transactions/search', method: 'POST' } } },
        { id: 'n10', type: 'compose_reply', position: { x: 50, y: 980 }, data: { label: 'Present Details', type: 'compose_reply', config: { message: 'Thanks for the details. Give me a second while I pull that up… I can see a transaction for {{amount}} cedis on {{date}} at {{merchant}} in {{location}}. Does this sound familiar?' } } },
        { id: 'n11', type: 'listen', position: { x: 50, y: 1100 }, data: { label: 'Recognition Check', type: 'listen' } },
        { id: 'n12', type: 'condition', position: { x: 50, y: 1220 }, data: { label: 'Recognized?', type: 'condition', config: { expression: 'customer_recognizes == false' } } },
        { id: 'n13', type: 'compose_reply', position: { x: 50, y: 1360 }, data: { label: 'Initiate Dispute', type: 'compose_reply', config: { message: 'I understand. Let\'s mark this as unauthorized. I\'ll initiate a dispute and block your card. Shall I issue a replacement card as well?' } } },
        { id: 'n14', type: 'listen', position: { x: 50, y: 1480 }, data: { label: 'Card Replacement', type: 'listen' } },
        { id: 'n15', type: 'api_call', position: { x: 50, y: 1600 }, data: { label: 'Process Dispute', type: 'api_call', config: { endpoint: '/disputes/create', method: 'POST' } } },
        { id: 'n16', type: 'compose_reply', position: { x: 50, y: 1720 }, data: { label: 'Confirm Actions', type: 'compose_reply', config: { message: 'Done. Your dispute is logged with reference {{disputeId}}, and your card is blocked. Is there anything else I can help you with?' } } },
        
        // Path B: Fund Transfer (x: 250)
        { id: 'n17', type: 'compose_reply', position: { x: 250, y: 500 }, data: { label: 'Request Transfer Info', type: 'compose_reply', config: { message: 'Sure. Could you share the date or recipient name for the transfer you\'d like to check?' } } },
        { id: 'n18', type: 'listen', position: { x: 250, y: 620 }, data: { label: 'Capture Transfer Details', type: 'listen' } },
        { id: 'n19', type: 'authentication', position: { x: 250, y: 740 }, data: { label: 'Verify Customer', type: 'authentication' } },
        { id: 'n20', type: 'api_call', position: { x: 250, y: 860 }, data: { label: 'Check Status', type: 'api_call', config: { endpoint: '/transfers/status' } } },
        { id: 'n21', type: 'compose_reply', position: { x: 250, y: 980 }, data: { label: 'Provide Status', type: 'compose_reply', config: { message: 'Let me quickly review that transfer… It was processed successfully {{status_time}}. Would you like the SWIFT confirmation?' } } },
        
        // Path C: Savings Account (x: 450)
        { id: 'n22', type: 'compose_reply', position: { x: 450, y: 500 }, data: { label: 'Account Info', type: 'compose_reply', config: { message: 'Sure. Our Savings Flex Individual account is quite popular — designed for high-transaction customers. You can open it with just five hundred and fifty Ghanaian cedis. Would you like the brochure?' } } },
        { id: 'n23', type: 'listen', position: { x: 450, y: 620 }, data: { label: 'Customer Preference', type: 'listen' } },
        { id: 'n24', type: 'condition', position: { x: 450, y: 740 }, data: { label: 'Route Action', type: 'condition' } },
        { id: 'n25', type: 'api_call', position: { x: 400, y: 880 }, data: { label: 'Send Brochure', type: 'api_call', config: { endpoint: '/brochures/send' } } },
        { id: 'n26', type: 'api_call', position: { x: 500, y: 880 }, data: { label: 'Schedule Callback', type: 'api_call', config: { endpoint: '/callbacks/schedule' } } },
        
        // Path D: ATM/Branch Locator (x: 650)
        { id: 'n27', type: 'compose_reply', position: { x: 650, y: 500 }, data: { label: 'Request Location', type: 'compose_reply', config: { message: 'Of course. Could you share your current location or ZIP code?' } } },
        { id: 'n28', type: 'listen', position: { x: 650, y: 620 }, data: { label: 'Capture Location', type: 'listen' } },
        { id: 'n29', type: 'api_call', position: { x: 650, y: 740 }, data: { label: 'Find Branch', type: 'api_call', config: { endpoint: '/locations/nearest' } } },
        { id: 'n30', type: 'compose_reply', position: { x: 650, y: 860 }, data: { label: 'Provide Location', type: 'compose_reply', config: { message: 'The nearest branch is at {{address}}, approximately {{distance}} away. Shall I send the Google Maps link?' } } },
        
        // Path E: Forex (x: 850)
        { id: 'n31', type: 'compose_reply', position: { x: 850, y: 500 }, data: { label: 'Request Currency', type: 'compose_reply', config: { message: 'I can help with that. Which currency and amount would you like to convert?' } } },
        { id: 'n32', type: 'listen', position: { x: 850, y: 620 }, data: { label: 'Capture Currency', type: 'listen' } },
        { id: 'n33', type: 'api_call', position: { x: 850, y: 740 }, data: { label: 'Get Rate', type: 'api_call', config: { endpoint: '/forex/convert' } } },
        { id: 'n34', type: 'compose_reply', position: { x: 850, y: 860 }, data: { label: 'Provide Conversion', type: 'compose_reply', config: { message: 'That would be around {{amount_words}} Ghanaian cedis at today\'s rate.' } } },
        
        // Path F: Portfolio (x: 1050)
        { id: 'n35', type: 'authentication', position: { x: 1050, y: 500 }, data: { label: 'Verify Customer', type: 'authentication' } },
        { id: 'n36', type: 'api_call', position: { x: 1050, y: 620 }, data: { label: 'Fetch Portfolio', type: 'api_call', config: { endpoint: '/portfolio/summary' } } },
        { id: 'n37', type: 'compose_reply', position: { x: 1050, y: 740 }, data: { label: 'Summarize Portfolio', type: 'compose_reply', config: { message: 'You currently have {{account_count}} savings accounts — {{fixed_deposit_info}} and {{regular_account_info}}. Your combined portfolio stands in a comfortable range.' } } },
        
        // Fallback & Escalation (right side)
        { id: 'n47', type: 'compose_reply', position: { x: 1300, y: 500 }, data: { label: 'Clarification', type: 'compose_reply', config: { message: 'I want to make sure I help you properly. Could you share a bit more about what you need assistance with?' } } },
        { id: 'n48', type: 'human_escalation', position: { x: 1300, y: 620 }, data: { label: 'Transfer to Agent', type: 'human_escalation', config: { message: 'Let me connect you with one of our specialized banking executives. Please hold for just a moment.', skillGroup: 'General Banking Support' } } },
        
        // CSAT Flow (centered below all paths)
        { id: 'n38', type: 'compose_reply', position: { x: 600, y: 1900 }, data: { label: 'Request CSAT', type: 'compose_reply', config: { message: 'Before we close, may I ask two quick feedback questions? It\'ll only take a few seconds.' } } },
        { id: 'n39', type: 'listen', position: { x: 600, y: 2020 }, data: { label: 'CSAT Agreement', type: 'listen' } },
        { id: 'n40', type: 'condition', position: { x: 600, y: 2140 }, data: { label: 'Customer Agrees?', type: 'condition' } },
        { id: 'n41', type: 'compose_reply', position: { x: 600, y: 2280 }, data: { label: 'Explain Rating', type: 'compose_reply', config: { message: 'It\'s a simple 1-to-5 rating — 1 means not satisfied and 5 means very satisfied.' } } },
        { id: 'n42', type: 'collect_dtmf', position: { x: 600, y: 2400 }, data: { label: 'Satisfaction Rating', type: 'collect_dtmf', config: { message: 'On a scale of 1 to 5, how satisfied are you with the assistance you received today?', length: 1 } } },
        { id: 'n43', type: 'collect_dtmf', position: { x: 600, y: 2520 }, data: { label: 'Resolution Rating', type: 'collect_dtmf', config: { message: 'Did I resolve your query? Press 1 for yes, 2 for no.', length: 1 } } },
        { id: 'n44', type: 'api_call', position: { x: 600, y: 2640 }, data: { label: 'Log CSAT', type: 'api_call', config: { endpoint: '/feedback/submit' } } },
        { id: 'n45', type: 'compose_reply', position: { x: 600, y: 2760 }, data: { label: 'Thank Customer', type: 'compose_reply', config: { message: 'Thank you for your feedback. It truly helps us improve your experience with GT Bank. Have a great day ahead!' } } },
        { id: 'n46', type: 'end', position: { x: 600, y: 2900 }, data: { label: 'Call Complete', type: 'end' } },
      ],
      edges: [
        // Main flow
        { id: 'e1-2', source: 'n1', target: 'n2', type: 'custom' },
        { id: 'e2-3', source: 'n2', target: 'n3', type: 'custom' },
        
        // Wait path
        { id: 'e3-4', source: 'n3', target: 'n4', sourceHandle: 'intent-6', type: 'custom', label: 'wait/pause' },
        { id: 'e4-5', source: 'n4', target: 'n5', type: 'custom' },
        { id: 'e5-3', source: 'n5', target: 'n3', type: 'custom', label: 'resume' },
        
        // Transaction dispute path
        { id: 'e3-6', source: 'n3', target: 'n6', sourceHandle: 'intent-0', type: 'custom', label: 'dispute' },
        { id: 'e6-7', source: 'n6', target: 'n7', type: 'custom' },
        { id: 'e7-8', source: 'n7', target: 'n8', type: 'custom' },
        { id: 'e8-9', source: 'n8', target: 'n9', type: 'custom' },
        { id: 'e9-10', source: 'n9', target: 'n10', type: 'custom' },
        { id: 'e10-11', source: 'n10', target: 'n11', type: 'custom' },
        { id: 'e11-12', source: 'n11', target: 'n12', type: 'custom' },
        { id: 'e12-13', source: 'n12', target: 'n13', sourceHandle: 'true', type: 'custom', label: 'not recognized' },
        { id: 'e13-14', source: 'n13', target: 'n14', type: 'custom' },
        { id: 'e14-15', source: 'n14', target: 'n15', type: 'custom' },
        { id: 'e15-16', source: 'n15', target: 'n16', type: 'custom' },
        { id: 'e16-38', source: 'n16', target: 'n38', type: 'custom' },
        { id: 'e12-38', source: 'n12', target: 'n38', sourceHandle: 'false', type: 'custom', label: 'recognized' },
        
        // Fund transfer path
        { id: 'e3-17', source: 'n3', target: 'n17', sourceHandle: 'intent-1', type: 'custom', label: 'transfer' },
        { id: 'e17-18', source: 'n17', target: 'n18', type: 'custom' },
        { id: 'e18-19', source: 'n18', target: 'n19', type: 'custom' },
        { id: 'e19-20', source: 'n19', target: 'n20', type: 'custom' },
        { id: 'e20-21', source: 'n20', target: 'n21', type: 'custom' },
        { id: 'e21-38', source: 'n21', target: 'n38', type: 'custom' },
        
        // Savings account path
        { id: 'e3-22', source: 'n3', target: 'n22', sourceHandle: 'intent-2', type: 'custom', label: 'savings' },
        { id: 'e22-23', source: 'n22', target: 'n23', type: 'custom' },
        { id: 'e23-24', source: 'n23', target: 'n24', type: 'custom' },
        { id: 'e24-25', source: 'n24', target: 'n25', sourceHandle: 'true', type: 'custom', label: 'brochure' },
        { id: 'e24-26', source: 'n24', target: 'n26', sourceHandle: 'false', type: 'custom', label: 'callback' },
        { id: 'e25-38', source: 'n25', target: 'n38', type: 'custom' },
        { id: 'e26-38', source: 'n26', target: 'n38', type: 'custom' },
        
        // ATM/Branch path
        { id: 'e3-27', source: 'n3', target: 'n27', sourceHandle: 'intent-3', type: 'custom', label: 'atm/branch' },
        { id: 'e27-28', source: 'n27', target: 'n28', type: 'custom' },
        { id: 'e28-29', source: 'n28', target: 'n29', type: 'custom' },
        { id: 'e29-30', source: 'n29', target: 'n30', type: 'custom' },
        { id: 'e30-38', source: 'n30', target: 'n38', type: 'custom' },
        
        // Forex path
        { id: 'e3-31', source: 'n3', target: 'n31', sourceHandle: 'intent-4', type: 'custom', label: 'forex' },
        { id: 'e31-32', source: 'n31', target: 'n32', type: 'custom' },
        { id: 'e32-33', source: 'n32', target: 'n33', type: 'custom' },
        { id: 'e33-34', source: 'n33', target: 'n34', type: 'custom' },
        { id: 'e34-38', source: 'n34', target: 'n38', type: 'custom' },
        
        // Portfolio path
        { id: 'e3-35', source: 'n3', target: 'n35', sourceHandle: 'intent-5', type: 'custom', label: 'portfolio' },
        { id: 'e35-36', source: 'n35', target: 'n36', type: 'custom' },
        { id: 'e36-37', source: 'n36', target: 'n37', type: 'custom' },
        { id: 'e37-38', source: 'n37', target: 'n38', type: 'custom' },
        
        // CSAT flow
        { id: 'e38-39', source: 'n38', target: 'n39', type: 'custom' },
        { id: 'e39-40', source: 'n39', target: 'n40', type: 'custom' },
        { id: 'e40-46', source: 'n40', target: 'n46', sourceHandle: 'false', type: 'custom', label: 'declined' },
        { id: 'e40-41', source: 'n40', target: 'n41', sourceHandle: 'true', type: 'custom', label: 'agreed' },
        { id: 'e41-42', source: 'n41', target: 'n42', type: 'custom' },
        { id: 'e42-43', source: 'n42', target: 'n43', type: 'custom' },
        { id: 'e43-44', source: 'n43', target: 'n44', type: 'custom' },
        { id: 'e44-45', source: 'n44', target: 'n45', type: 'custom' },
        { id: 'e45-46', source: 'n45', target: 'n46', type: 'custom' },
        
        // Fallback path
        { id: 'e3-47', source: 'n3', target: 'n47', sourceHandle: 'intent-7', type: 'custom', label: 'fallback' },
        { id: 'e47-2', source: 'n47', target: 'n2', type: 'custom', label: 'retry' },
        { id: 'e47-48', source: 'n47', target: 'n48', type: 'custom', label: 'after 2 retries' },
        { id: 'e48-46', source: 'n48', target: 'n46', type: 'custom' },
      ],
    };
  }

  if (flowId === '5') {
    // Outbound - Transaction Verification (Optimized vertical layout)
    return {
      nodes: [
        // Phase 1: Opening & Identity
        { id: 'n1', type: 'start', position: { x: 500, y: 50 }, data: { label: 'Initiate Call', type: 'start' } },
        { id: 'n2', type: 'compose_reply', position: { x: 500, y: 170 }, data: { label: 'Opening Message', type: 'compose_reply', config: { message: 'Hello, this is Ava from Zenyth Bank\'s Fraud Monitoring Unit. Is this [Customer Name]?' } } },
        { id: 'n3', type: 'listen', position: { x: 500, y: 280 }, data: { label: 'Confirm Identity', type: 'listen' } },
        { id: 'n4', type: 'condition', position: { x: 500, y: 390 }, data: { label: 'Customer Confirmed?', type: 'condition' } },
        
        // Phase 2: Transaction Alert
        { id: 'n5', type: 'compose_reply', position: { x: 500, y: 520 }, data: { label: 'Identity Verification', type: 'compose_reply', config: { message: 'For your security, may I please confirm your full name or the last four digits of the card?' } } },
        { id: 'n6', type: 'listen', position: { x: 500, y: 630 }, data: { label: 'Capture Verification', type: 'listen' } },
        { id: 'n7', type: 'authentication', position: { x: 500, y: 740 }, data: { label: 'Validate Identity', type: 'authentication' } },
        { id: 'n8', type: 'compose_reply', position: { x: 500, y: 850 }, data: { label: 'Transaction Summary', type: 'compose_reply', config: { message: 'We noticed a transaction of Ghanaian Cedi Four Hundred and Fifty on your card ending with {{last_4}} at ElectroPlus Mall, Accra today at 3:45 PM. Did you authorize this?' } } },
        { id: 'n9', type: 'listen', position: { x: 500, y: 960 }, data: { label: 'Authorization Response', type: 'listen' } },
        { id: 'n10', type: 'condition', position: { x: 500, y: 1070 }, data: { label: 'Transaction Authorized?', type: 'condition' } },
        
        // Path A: Confirmed (left)
        { id: 'n11', type: 'compose_reply', position: { x: 250, y: 1220 }, data: { label: 'Acknowledge Confirmation', type: 'compose_reply', config: { message: 'Thank you for confirming. No further action needed.' } } },
        { id: 'n12', type: 'compose_reply', position: { x: 250, y: 1330 }, data: { label: 'Offer Additional Support', type: 'compose_reply', config: { message: 'Would you like me to stay on the call for any other support regarding your card today?' } } },
        { id: 'n13', type: 'listen', position: { x: 250, y: 1440 }, data: { label: 'Additional Support Response', type: 'listen' } },
        { id: 'n14', type: 'condition', position: { x: 250, y: 1550 }, data: { label: 'Needs Support?', type: 'condition' } },
        
        // Path B: Dispute Process (right)
        { id: 'n15', type: 'compose_reply', position: { x: 750, y: 1220 }, data: { label: 'Acknowledge Unauthorized', type: 'compose_reply', config: { message: 'I understand. Thank you for letting us know. Let me assist you step by step.' } } },
        { id: 'n16', type: 'compose_reply', position: { x: 750, y: 1330 }, data: { label: 'Offer Dispute', type: 'compose_reply', config: { message: 'Would you like me to mark this transaction as fraudulent and raise a dispute?' } } },
        { id: 'n17', type: 'listen', position: { x: 750, y: 1440 }, data: { label: 'Dispute Confirmation', type: 'listen' } },
        { id: 'n18', type: 'condition', position: { x: 750, y: 1550 }, data: { label: 'Create Dispute?', type: 'condition' } },
        { id: 'n19', type: 'api_call', position: { x: 750, y: 1670 }, data: { label: 'Create Fraud Dispute', type: 'api_call', config: { endpoint: '/disputes/fraud/create' } } },
        { id: 'n20', type: 'compose_reply', position: { x: 750, y: 1780 }, data: { label: 'Dispute Confirmed', type: 'compose_reply', config: { message: 'Your dispute is logged with reference {{disputeId}}' } } },
        
        // Card Block Flow
        { id: 'n21', type: 'compose_reply', position: { x: 750, y: 1900 }, data: { label: 'Offer Card Block', type: 'compose_reply', config: { message: 'Would you also like me to block this card immediately?' } } },
        { id: 'n22', type: 'listen', position: { x: 750, y: 2010 }, data: { label: 'Block Confirmation', type: 'listen' } },
        { id: 'n23', type: 'condition', position: { x: 750, y: 2120 }, data: { label: 'Block Card?', type: 'condition' } },
        { id: 'n24', type: 'api_call', position: { x: 750, y: 2240 }, data: { label: 'Block Card', type: 'api_call', config: { endpoint: '/cards/block' } } },
        { id: 'n25', type: 'compose_reply', position: { x: 750, y: 2350 }, data: { label: 'Card Blocked Confirmation', type: 'compose_reply', config: { message: 'Your card is now blocked' } } },
        
        // Replacement Flow
        { id: 'n26', type: 'compose_reply', position: { x: 750, y: 2470 }, data: { label: 'Offer Replacement', type: 'compose_reply', config: { message: 'I can arrange for a replacement card. Would you like me to do that?' } } },
        { id: 'n27', type: 'listen', position: { x: 750, y: 2580 }, data: { label: 'Replacement Confirmation', type: 'listen' } },
        { id: 'n28', type: 'condition', position: { x: 750, y: 2690 }, data: { label: 'Issue Replacement?', type: 'condition' } },
        { id: 'n29', type: 'api_call', position: { x: 750, y: 2810 }, data: { label: 'Issue Replacement Card', type: 'api_call', config: { endpoint: '/cards/replace' } } },
        
        { id: 'n30', type: 'compose_reply', position: { x: 500, y: 2970 }, data: { label: 'Final Summary', type: 'compose_reply', config: { message: 'You\'ll receive updates via SMS and email shortly. Thank you and have a good day.' } } },
        { id: 'n31', type: 'end', position: { x: 500, y: 3100 }, data: { label: 'Call Complete', type: 'end' } },
      ],
      edges: [
        { id: 'e1-2', source: 'n1', target: 'n2', type: 'custom' },
        { id: 'e2-3', source: 'n2', target: 'n3', type: 'custom' },
        { id: 'e3-4', source: 'n3', target: 'n4', type: 'custom' },
        { id: 'e4-5', source: 'n4', target: 'n5', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e4-31', source: 'n4', target: 'n31', sourceHandle: 'false', type: 'custom', label: 'wrong person' },
        { id: 'e5-6', source: 'n5', target: 'n6', type: 'custom' },
        { id: 'e6-7', source: 'n6', target: 'n7', type: 'custom' },
        { id: 'e7-8', source: 'n7', target: 'n8', type: 'custom' },
        { id: 'e8-9', source: 'n8', target: 'n9', type: 'custom' },
        { id: 'e9-10', source: 'n9', target: 'n10', type: 'custom' },
        { id: 'e10-11', source: 'n10', target: 'n11', sourceHandle: 'true', type: 'custom', label: 'authorized' },
        { id: 'e10-15', source: 'n10', target: 'n15', sourceHandle: 'false', type: 'custom', label: 'unauthorized' },
        { id: 'e11-12', source: 'n11', target: 'n12', type: 'custom' },
        { id: 'e12-13', source: 'n12', target: 'n13', type: 'custom' },
        { id: 'e13-14', source: 'n13', target: 'n14', type: 'custom' },
        { id: 'e14-30', source: 'n14', target: 'n30', type: 'custom' },
        { id: 'e15-16', source: 'n15', target: 'n16', type: 'custom' },
        { id: 'e16-17', source: 'n16', target: 'n17', type: 'custom' },
        { id: 'e17-18', source: 'n17', target: 'n18', type: 'custom' },
        { id: 'e18-19', source: 'n18', target: 'n19', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e18-21', source: 'n18', target: 'n21', sourceHandle: 'false', type: 'custom', label: 'no' },
        { id: 'e19-20', source: 'n19', target: 'n20', type: 'custom' },
        { id: 'e20-21', source: 'n20', target: 'n21', type: 'custom' },
        { id: 'e21-22', source: 'n21', target: 'n22', type: 'custom' },
        { id: 'e22-23', source: 'n22', target: 'n23', type: 'custom' },
        { id: 'e23-24', source: 'n23', target: 'n24', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e23-26', source: 'n23', target: 'n26', sourceHandle: 'false', type: 'custom', label: 'no' },
        { id: 'e24-25', source: 'n24', target: 'n25', type: 'custom' },
        { id: 'e25-26', source: 'n25', target: 'n26', type: 'custom' },
        { id: 'e26-27', source: 'n26', target: 'n27', type: 'custom' },
        { id: 'e27-28', source: 'n27', target: 'n28', type: 'custom' },
        { id: 'e28-29', source: 'n28', target: 'n29', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e28-30', source: 'n28', target: 'n30', sourceHandle: 'false', type: 'custom', label: 'no' },
        { id: 'e29-30', source: 'n29', target: 'n30', type: 'custom' },
        { id: 'e30-31', source: 'n30', target: 'n31', type: 'custom' },
      ],
    };
  }

  if (flowId === '6') {
    // Outbound - Credit Card Upgrade (Optimized vertical layout)
    return {
      nodes: [
        { id: 'n1', type: 'start', position: { x: 600, y: 50 }, data: { label: 'Initiate Call', type: 'start' } },
        { id: 'n2', type: 'compose_reply', position: { x: 600, y: 170 }, data: { label: 'Opening Message', type: 'compose_reply', config: { message: 'Hello! This is Ava from Zenyth Bank. Is this a good time to talk?' } } },
        { id: 'n3', type: 'listen', position: { x: 600, y: 280 }, data: { label: 'Availability Check', type: 'listen' } },
        { id: 'n4', type: 'condition', position: { x: 600, y: 390 }, data: { label: 'Customer Available?', type: 'condition' } },
        
        { id: 'n5', type: 'compose_reply', position: { x: 600, y: 540 }, data: { label: 'Introduce Offer', type: 'compose_reply', config: { message: 'I\'m calling with a special credit card upgrade offer just for you. Would you like to hear more?' } } },
        { id: 'n6', type: 'listen', position: { x: 600, y: 660 }, data: { label: 'Interest Check', type: 'listen' } },
        { id: 'n7', type: 'condition', position: { x: 600, y: 780 }, data: { label: 'Customer Interested?', type: 'condition' } },
        
        // Path A: Not Interested (left)
        { id: 'n8', type: 'compose_reply', position: { x: 300, y: 930 }, data: { label: 'Acknowledge Decline', type: 'compose_reply', config: { message: 'Understood. Thank you for being a valued cardholder.' } } },
        { id: 'n9', type: 'end', position: { x: 300, y: 1060 }, data: { label: 'Call Complete', type: 'end' } },
        
        // Path B: Interested (right)
        { id: 'n10', type: 'compose_reply', position: { x: 900, y: 930 }, data: { label: 'Highlight Benefits', type: 'compose_reply', config: { message: 'Wonderful. The Platinum Advantage Card comes with complimentary airport lounge access, higher cashback limits, and no annual charges for the first year.' } } },
        { id: 'n11', type: 'listen', position: { x: 900, y: 1050 }, data: { label: 'Customer Response', type: 'listen' } },
        { id: 'n12', type: 'intent_router', position: { x: 900, y: 1170 }, data: { label: 'Route Query Type', type: 'intent_router', config: { intents: ['Basic Info', 'Complex Questions', 'Accept Offer', 'Decline'] } } },
        
        // Path C: Basic Info (left branch from router)
        { id: 'n13', type: 'compose_reply', position: { x: 600, y: 1340 }, data: { label: 'Provide Basic Info', type: 'compose_reply', config: { message: 'Eligibility is based on usage and payment history. Upgrades usually take 3-5 working days.' } } },
        { id: 'n14', type: 'compose_reply', position: { x: 600, y: 1460 }, data: { label: 'Further Questions?', type: 'compose_reply', config: { message: 'Is there anything else you\'d like to know about the upgrade?' } } },
        { id: 'n15', type: 'listen', position: { x: 600, y: 1580 }, data: { label: 'Loop Response', type: 'listen' } },
        
        // Path D: Complex → Human (middle branch)
        { id: 'n16', type: 'compose_reply', position: { x: 900, y: 1340 }, data: { label: 'Offer Specialist Callback', type: 'compose_reply', config: { message: 'I can arrange a callback from a credit specialist who can explain all upgrade terms in detail.' } } },
        { id: 'n17', type: 'listen', position: { x: 900, y: 1460 }, data: { label: 'Callback Confirmation', type: 'listen' } },
        { id: 'n18', type: 'condition', position: { x: 900, y: 1580 }, data: { label: 'Schedule Callback?', type: 'condition' } },
        { id: 'n19', type: 'api_call', position: { x: 900, y: 1710 }, data: { label: 'Schedule Callback', type: 'api_call', config: { endpoint: '/callbacks/schedule' } } },
        { id: 'n20', type: 'compose_reply', position: { x: 900, y: 1830 }, data: { label: 'Callback Scheduled', type: 'compose_reply', config: { message: 'A specialist will call you within 24 hours. Thank you!' } } },
        { id: 'n21', type: 'end', position: { x: 900, y: 1950 }, data: { label: 'Call Complete', type: 'end' } },
        
        // Path E: Accept Offer (right branch)
        { id: 'n22', type: 'compose_reply', position: { x: 1200, y: 1340 }, data: { label: 'Confirm Acceptance', type: 'compose_reply', config: { message: 'Excellent! I\'ll initiate your upgrade request.' } } },
        { id: 'n23', type: 'api_call', position: { x: 1200, y: 1460 }, data: { label: 'Process Upgrade Request', type: 'api_call', config: { endpoint: '/cards/upgrade' } } },
        { id: 'n24', type: 'compose_reply', position: { x: 1200, y: 1580 }, data: { label: 'Thank & Close', type: 'compose_reply', config: { message: 'You\'ll receive your new Platinum card within 7-10 business days. Have a great day!' } } },
        { id: 'n25', type: 'end', position: { x: 1200, y: 1700 }, data: { label: 'Call Complete', type: 'end' } },
      ],
      edges: [
        { id: 'e1-2', source: 'n1', target: 'n2', type: 'custom' },
        { id: 'e2-3', source: 'n2', target: 'n3', type: 'custom' },
        { id: 'e3-4', source: 'n3', target: 'n4', type: 'custom' },
        { id: 'e4-5', source: 'n4', target: 'n5', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e4-8', source: 'n4', target: 'n8', sourceHandle: 'false', type: 'custom', label: 'not now' },
        { id: 'e5-6', source: 'n5', target: 'n6', type: 'custom' },
        { id: 'e6-7', source: 'n6', target: 'n7', type: 'custom' },
        { id: 'e7-8', source: 'n7', target: 'n8', sourceHandle: 'false', type: 'custom', label: 'not interested' },
        { id: 'e7-10', source: 'n7', target: 'n10', sourceHandle: 'true', type: 'custom', label: 'interested' },
        { id: 'e8-9', source: 'n8', target: 'n9', type: 'custom' },
        { id: 'e10-11', source: 'n10', target: 'n11', type: 'custom' },
        { id: 'e11-12', source: 'n11', target: 'n12', type: 'custom' },
        { id: 'e12-13', source: 'n12', target: 'n13', sourceHandle: 'intent-0', type: 'custom', label: 'basic info' },
        { id: 'e12-16', source: 'n12', target: 'n16', sourceHandle: 'intent-1', type: 'custom', label: 'complex' },
        { id: 'e12-22', source: 'n12', target: 'n22', sourceHandle: 'intent-2', type: 'custom', label: 'accept' },
        { id: 'e12-8', source: 'n12', target: 'n8', sourceHandle: 'intent-3', type: 'custom', label: 'decline' },
        { id: 'e13-14', source: 'n13', target: 'n14', type: 'custom' },
        { id: 'e14-15', source: 'n14', target: 'n15', type: 'custom' },
        { id: 'e15-12', source: 'n15', target: 'n12', type: 'custom', label: 'loop' },
        { id: 'e16-17', source: 'n16', target: 'n17', type: 'custom' },
        { id: 'e17-18', source: 'n17', target: 'n18', type: 'custom' },
        { id: 'e18-19', source: 'n18', target: 'n19', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e18-21', source: 'n18', target: 'n21', sourceHandle: 'false', type: 'custom', label: 'no' },
        { id: 'e19-20', source: 'n19', target: 'n20', type: 'custom' },
        { id: 'e20-21', source: 'n20', target: 'n21', type: 'custom' },
        { id: 'e22-23', source: 'n22', target: 'n23', type: 'custom' },
        { id: 'e23-24', source: 'n23', target: 'n24', type: 'custom' },
        { id: 'e24-25', source: 'n24', target: 'n25', type: 'custom' },
      ],
    };
  }

  if (flowId === '7') {
    // Outbound - KYC Document Reminder (Optimized vertical layout)
    return {
      nodes: [
        { id: 'n1', type: 'start', position: { x: 600, y: 50 }, data: { label: 'Initiate Call', type: 'start' } },
        { id: 'n2', type: 'compose_reply', position: { x: 600, y: 170 }, data: { label: 'Opening Message', type: 'compose_reply', config: { message: 'Hello! This is Ava from Zenyth Bank. Is this [Customer Name]?' } } },
        { id: 'n3', type: 'listen', position: { x: 600, y: 280 }, data: { label: 'Identity Confirmation', type: 'listen' } },
        { id: 'n4', type: 'condition', position: { x: 600, y: 390 }, data: { label: 'Correct Person?', type: 'condition' } },
        
        { id: 'n5', type: 'compose_reply', position: { x: 600, y: 540 }, data: { label: 'Explain Purpose', type: 'compose_reply', config: { message: 'I\'m calling regarding your loan application. We\'ve noticed that one or more required documents are still pending. Would you like me to remind you of the missing items?' } } },
        { id: 'n6', type: 'listen', position: { x: 600, y: 680 }, data: { label: 'Customer Response', type: 'listen' } },
        { id: 'n7', type: 'condition', position: { x: 600, y: 800 }, data: { label: 'Wants Reminder?', type: 'condition' } },
        
        { id: 'n8', type: 'api_call', position: { x: 600, y: 950 }, data: { label: 'Fetch Pending Documents', type: 'api_call', config: { endpoint: '/loans/documents/pending' } } },
        { id: 'n9', type: 'compose_reply', position: { x: 600, y: 1070 }, data: { label: 'List Pending Docs', type: 'compose_reply', config: { message: 'Our system shows your income proof and national ID copy are still pending.' } } },
        { id: 'n10', type: 'listen', position: { x: 600, y: 1190 }, data: { label: 'Customer Response', type: 'listen' } },
        { id: 'n11', type: 'intent_router', position: { x: 600, y: 1310 }, data: { label: 'Route Response Type', type: 'intent_router', config: { intents: ['Already Submitted', 'Need Instructions', 'Complex Issue', 'Will Submit'] } } },
        
        // Path A: Already Submitted (leftmost)
        { id: 'n12', type: 'compose_reply', position: { x: 200, y: 1480 }, data: { label: 'Acknowledge Submission', type: 'compose_reply', config: { message: 'Thank you. Sometimes uploads take time to reflect. I\'ll mark your feedback and someone will verify.' } } },
        { id: 'n13', type: 'api_call', position: { x: 200, y: 1600 }, data: { label: 'Flag for Manual Verification', type: 'api_call', config: { endpoint: '/documents/verify' } } },
        { id: 'n14', type: 'end', position: { x: 200, y: 1720 }, data: { label: 'Call Complete', type: 'end' } },
        
        // Path B: Upload Instructions (left-center)
        { id: 'n15', type: 'compose_reply', position: { x: 450, y: 1480 }, data: { label: 'Provide Instructions', type: 'compose_reply', config: { message: 'You can upload them using the link sent to your phone or email. Accepted formats are PDF, JPG, or PNG.' } } },
        { id: 'n16', type: 'compose_reply', position: { x: 450, y: 1600 }, data: { label: 'Offer Checklist', type: 'compose_reply', config: { message: 'Would you like me to send you a detailed checklist via SMS?' } } },
        { id: 'n17', type: 'listen', position: { x: 450, y: 1720 }, data: { label: 'Checklist Confirmation', type: 'listen' } },
        { id: 'n18', type: 'condition', position: { x: 450, y: 1840 }, data: { label: 'Send Checklist?', type: 'condition' } },
        { id: 'n19', type: 'api_call', position: { x: 450, y: 1970 }, data: { label: 'Send SMS Checklist', type: 'api_call', config: { endpoint: '/sms/checklist' } } },
        { id: 'n20', type: 'end', position: { x: 450, y: 2090 }, data: { label: 'Call Complete', type: 'end' } },
        
        // Path C: Complex Issue (right-center)
        { id: 'n21', type: 'compose_reply', position: { x: 750, y: 1480 }, data: { label: 'Offer Specialist Callback', type: 'compose_reply', config: { message: 'I can arrange a callback from our document verification team.' } } },
        { id: 'n22', type: 'listen', position: { x: 750, y: 1600 }, data: { label: 'Callback Confirmation', type: 'listen' } },
        { id: 'n23', type: 'condition', position: { x: 750, y: 1720 }, data: { label: 'Schedule Callback?', type: 'condition' } },
        { id: 'n24', type: 'api_call', position: { x: 750, y: 1850 }, data: { label: 'Schedule Verification Team Callback', type: 'api_call', config: { endpoint: '/callbacks/verification' } } },
        { id: 'n25', type: 'compose_reply', position: { x: 750, y: 1970 }, data: { label: 'Callback Scheduled', type: 'compose_reply', config: { message: 'A specialist will contact you within 24 hours. Thank you!' } } },
        { id: 'n26', type: 'end', position: { x: 750, y: 2090 }, data: { label: 'Call Complete', type: 'end' } },
        
        // Path D: Will Submit (rightmost)
        { id: 'n27', type: 'compose_reply', position: { x: 1000, y: 1480 }, data: { label: 'Set Deadline Expectation', type: 'compose_reply', config: { message: 'Perfect. Once your documents are submitted, we\'ll proceed with the loan process.' } } },
        { id: 'n28', type: 'compose_reply', position: { x: 1000, y: 1600 }, data: { label: 'Thank & Close', type: 'compose_reply', config: { message: 'Thanks for your time. We look forward to processing your application. Have a great day!' } } },
        { id: 'n29', type: 'end', position: { x: 1000, y: 1720 }, data: { label: 'Call Complete', type: 'end' } },
      ],
      edges: [
        { id: 'e1-2', source: 'n1', target: 'n2', type: 'custom' },
        { id: 'e2-3', source: 'n2', target: 'n3', type: 'custom' },
        { id: 'e3-4', source: 'n3', target: 'n4', type: 'custom' },
        { id: 'e4-5', source: 'n4', target: 'n5', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e4-29', source: 'n4', target: 'n29', sourceHandle: 'false', type: 'custom', label: 'wrong person' },
        { id: 'e5-6', source: 'n5', target: 'n6', type: 'custom' },
        { id: 'e6-7', source: 'n6', target: 'n7', type: 'custom' },
        { id: 'e7-8', source: 'n7', target: 'n8', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e7-29', source: 'n7', target: 'n29', sourceHandle: 'false', type: 'custom', label: 'no' },
        { id: 'e8-9', source: 'n8', target: 'n9', type: 'custom' },
        { id: 'e9-10', source: 'n9', target: 'n10', type: 'custom' },
        { id: 'e10-11', source: 'n10', target: 'n11', type: 'custom' },
        { id: 'e11-12', source: 'n11', target: 'n12', sourceHandle: 'intent-0', type: 'custom', label: 'already submitted' },
        { id: 'e11-15', source: 'n11', target: 'n15', sourceHandle: 'intent-1', type: 'custom', label: 'need instructions' },
        { id: 'e11-21', source: 'n11', target: 'n21', sourceHandle: 'intent-2', type: 'custom', label: 'complex issue' },
        { id: 'e11-27', source: 'n11', target: 'n27', sourceHandle: 'intent-3', type: 'custom', label: 'will submit' },
        { id: 'e12-13', source: 'n12', target: 'n13', type: 'custom' },
        { id: 'e13-14', source: 'n13', target: 'n14', type: 'custom' },
        { id: 'e15-16', source: 'n15', target: 'n16', type: 'custom' },
        { id: 'e16-17', source: 'n16', target: 'n17', type: 'custom' },
        { id: 'e17-18', source: 'n17', target: 'n18', type: 'custom' },
        { id: 'e18-19', source: 'n18', target: 'n19', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e18-20', source: 'n18', target: 'n20', sourceHandle: 'false', type: 'custom', label: 'no' },
        { id: 'e19-20', source: 'n19', target: 'n20', type: 'custom' },
        { id: 'e21-22', source: 'n21', target: 'n22', type: 'custom' },
        { id: 'e22-23', source: 'n22', target: 'n23', type: 'custom' },
        { id: 'e23-24', source: 'n23', target: 'n24', sourceHandle: 'true', type: 'custom', label: 'yes' },
        { id: 'e23-26', source: 'n23', target: 'n26', sourceHandle: 'false', type: 'custom', label: 'no' },
        { id: 'e24-25', source: 'n24', target: 'n25', type: 'custom' },
        { id: 'e25-26', source: 'n25', target: 'n26', type: 'custom' },
        { id: 'e27-28', source: 'n27', target: 'n28', type: 'custom' },
        { id: 'e28-29', source: 'n28', target: 'n29', type: 'custom' },
      ],
    };
  }
  
  // Default basic flow
  return {
    nodes: [
      { id: '1', type: 'start', position: { x: 250, y: 50 }, data: { label: 'Start', type: 'start' } },
      { id: '2', type: 'listen', position: { x: 250, y: 200 }, data: { label: 'Listen', type: 'listen' } },
      { id: '3', type: 'end', position: { x: 250, y: 350 }, data: { label: 'End', type: 'end' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'custom' },
      { id: 'e2-3', source: '2', target: '3', type: 'custom' },
    ],
  };
};

export const Canvas: React.FC<CanvasProps> = ({ zoom, onNodeSelect, onNodesChange, onEdgesChange, flowId }) => {
  const initialFlow = getInitialFlowData(flowId);
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialFlow.edges);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Validate flow whenever nodes or edges change
  useEffect(() => {
    const errors = validateFlow(nodes, edges);
    setValidationErrors(errors);
    
    // Mark nodes with errors
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          hasError: errors.some((e) => e.nodeId === node.id),
        },
      }))
    );
  }, [nodes, edges, setNodes]);

  // Notify parent of changes
  useEffect(() => {
    onNodesChange?.(nodes);
  }, [nodes, onNodesChange]);

  useEffect(() => {
    onEdgesChange?.(edges);
  }, [edges, onEdgesChange]);

  // Fit view when flow loads or changes
  useEffect(() => {
    if (reactFlowInstance && nodes.length > 0) {
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
      }, 100);
    }
  }, [reactFlowInstance, flowId]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'custom' }, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top,
      };

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: {
          label: type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          type,
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeSelect(node.id);
    },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  const errorCount = validationErrors.filter(e => e.severity === 'error').length;

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeInternal}
        onEdgesChange={onEdgesChangeInternal}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={setReactFlowInstance}
        fitView
        snapToGrid
        snapGrid={[8, 8]}
        defaultEdgeOptions={{ type: 'custom' }}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background gap={16} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-background !border-border"
        />
        
        {errorCount > 0 && (
          <Panel position="top-center">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorCount} validation {errorCount === 1 ? 'error' : 'errors'} found
              </AlertDescription>
            </Alert>
          </Panel>
        )}

        <svg style={{ position: 'absolute', top: 0, left: 0 }}>
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <polygon points="0 0, 10 3, 0 6" fill="hsl(var(--primary))" />
            </marker>
          </defs>
        </svg>
      </ReactFlow>
    </div>
  );
};
