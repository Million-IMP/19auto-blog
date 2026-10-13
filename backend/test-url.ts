import { aiService } from './src/services/aiService';

async function main() {
  const result = await aiService.processInboxItem("참고 콘텐츠: https://blog.naver.com/cosmos_rich/224398314852 좀 요약해줘");
  console.log(result);
}
main();
