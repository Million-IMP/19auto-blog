import { aiService } from './src/services/aiService';

async function main() {
  try {
    const result = await aiService.processInboxItem("오늘 프로젝트 회고하면서 느낀 점, 테스트 코드 작성은 무조건 먼저 해야 시간 아낌.");
    console.log("Success:", result);
  } catch (e) {
    console.error(e);
  }
}
main();
