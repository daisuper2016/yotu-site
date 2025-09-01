// File: netlify/functions/counter.js
import { kv } from '@vercel/kv';

export async function handler(event, context) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `visits_shortphim_${today}`;
    
    // Tăng và lấy giá trị
    const count = await kv.incr(key);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}