const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 날짜 구간 쿼리(from/to 'YYYY-MM-DD', 둘 다 선택)의 순서 검사.
 * 둘 다 있고 형식이 맞을 때만 from <= to를 본다 ('YYYY-MM-DD'는 문자열 비교가 날짜 순서와 같음).
 * 생략했거나 형식이 틀린 값은 true — 형식 오류는 각 필드의 z.iso.date()가 잡는다.
 */
export const isOrderedDateRange = ({
  from,
  to,
}: {
  from?: unknown;
  to?: unknown;
}): boolean =>
  typeof from !== 'string' ||
  typeof to !== 'string' ||
  !ISO_DATE.test(from) ||
  !ISO_DATE.test(to) ||
  from <= to;

/** isOrderedDateRange가 false일 때의 오류 (Zod refine 옵션) */
export const DATE_RANGE_ERROR = {
  message: '시작일은 종료일과 같거나 이전이어야 합니다.',
  path: ['from'],
};
