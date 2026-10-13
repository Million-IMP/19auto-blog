import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();
const anthropic = new Anthropic(); 

const testModel = async (model: string) => {
  try {
    const res = await anthropic.messages.create({
      model: model, 
      max_tokens: 10, 
      messages: [{role: 'user', content: 'test'}]
    });
    console.log('Success:', res.model);
  } catch (e: any) {
    console.error('Error with', model, ':', e.message);
  }
}

async function run() {
  await testModel('claude-haiku-5-5');
  await testModel('claude-3-haiku-20240307');
}
run();
