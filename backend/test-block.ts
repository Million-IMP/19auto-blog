import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '', 
});

async function main() {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 100,
      messages: [{ role: "user", content: "Hello" }]
    });
    
    console.log("msg.content type:", Array.isArray(msg.content));
    console.log("msg.content length:", msg.content.length);
    msg.content.forEach((block, i) => {
      console.log(`Block ${i}: type = ${block.type}, text = ${(block as any).text}`);
    });
    
    const textBlock = msg.content.find((block) => block.type === 'text') as any;
    console.log("Found text block:", textBlock?.text);
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
