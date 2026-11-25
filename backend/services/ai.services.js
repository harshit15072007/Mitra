const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function askBusinessAI(question, business, history = []) {
    const apiKey = process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey) {
        const error = new Error('AI is not configured. Add OPEN_ROUTER_API_KEY to the project .env file.');
        error.status = 503;
        throw error;
    }

    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are Mitra, a practical business copilot for a merchant. Tailor examples and recommendations to the merchant profession and business type supplied in their profile. Make suggestions relevant to their field, such as groceries, electronics, fashion, food service, beauty, or home goods. Use selected-period sales totals, order and unit counts, top products, and current inventory quantities and low-stock flags as the only evidence for claims about this merchant business. Clearly identify inventory items at or below their refill threshold and recommend restocking when useful. Name the sales period and use figures when relevant. You may offer general profession-specific ideas even when sales data is limited, but label them as suggestions and do not claim specific inventory, costs, profit, customers, or operational conditions beyond the supplied data. Keep answers concise, practical, and clear about what is known versus suggested. If data is insufficient to answer a performance question, say what additional information is needed. Only provide actionable advice and avoid generic statements. Avoid making assumptions about the business beyond the supplied data. If the question is unrelated to the business, politely decline to answer. Also only give answer relevant to the business and do not provide unrelated information. Avoid repeating the question in your answer.',
                },
                {
                    role: 'user',
                    content: `Selected-period business data (money values in INR): ${JSON.stringify(business)}`,
                },
                ...history,
                { role: 'user', content: question },
            ],
        }),
    });

    if (!response.ok) {
        const error = new Error(`Please ask question relevant to the business. The AI provider returned an error: ${response.status} ${response.statusText}`);
        error.status = 502;
        throw error;
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
        const error = new Error('The AI provider returned an empty answer.');
        error.status = 502;
        throw error;
    }
    return answer;
}

module.exports = askBusinessAI;
