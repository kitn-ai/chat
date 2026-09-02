// The scripted mock: a rich thread on first paint (reasoning + a tool call),
// so the block demos what the components render, not two plain text bubbles.
// Leaf module by design - constants only - so the CDN-form generator can
// inline it. Swap createMockResponder for a fetch to your endpoint to go live.
export const MOCK_SCRIPT = [
  {
    reasoning:
      'An order question. Look the order up before answering - guessing a delivery date is worse than a short wait.',
    text: 'Let me pull up that order.',
    toolCalls: [{ name: 'lookup_order', arguments: { order: 'KAI-1042' } }],
  },
  {
    text: "Order KAI-1042 shipped with DHL and should arrive Thursday. (I'm a local mock - no provider was contacted - but a real model's tool call renders exactly like the row above.)",
  },
  {
    text: 'Anything else? Still the mock: swap the provider seam for your endpoint and this handler keeps its exact shape.',
  },
];

export const MOCK_TOOL_OUTPUTS = {
  lookup_order: { order: 'KAI-1042', status: 'shipped', carrier: 'DHL', eta: 'Thursday' },
};

export const SUGGESTIONS = ["Where's my order?", 'Request a refund'];
