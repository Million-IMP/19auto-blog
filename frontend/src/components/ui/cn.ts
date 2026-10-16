// 조건부 클래스 이어 붙이기. falsy 값은 버린다.
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
