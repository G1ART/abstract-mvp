/**
 * Korean copy for guided tours — stored as UTF-8 string literals in this file
 * so the overlay never resolves long KR through `messages.ts` / `t()` at runtime.
 * English and keys in `tourRegistry.ts` stay the i18n path; edit both when copy changes.
 */

/**
 * Tour popover / help: never lead with Geist. Variable Latin + composited overlay
 * has produced wrong glyphs for both EN and KR in some Chromium/WebKit builds.
 */
export const TOUR_POPOVER_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

export const TOUR_KO_CHROME = {
  next: "다음",
  prev: "이전",
  skip: "건너뛰기",
  done: "완료",
  reopen: "가이드 보기",
} as const;

/** Tour id → small eyebrow label in the popover */
export const TOUR_KO_HEADER: Record<string, string> = {
  "studio.main": "스튜디오 안내",
  "upload.main": "업로드 안내",
  "exhibition.create": "전시 게시물 안내",
  "people.main": "사람 찾기",
  "delegation.main": "위임 안내",
  "network.main": "네트워크 안내",
};

/** `${tourId}:${stepId}` → title + body */
export const TOUR_KO_STEP: Record<string, { title: string; body: string }> = {
  "studio.main:hero": {
    title: "내 스튜디오에 오신 걸 환영해요",
    body: "Abstract에서 만들고, 담고, 공유하는 모든 것이 시작되는 공간이에요.",
  },
  "studio.main:next-steps": {
    title: "다음으로 해보면 좋은 일",
    body: "지금 스튜디오에 도움이 될 만한 일을 간단히 모아두는 곳이에요. 프로필·작품·문의를 바로 열 수 있어요.",
  },
  "studio.main:grid": {
    title: "운영 타일",
    body: "작업실·보드·전시처럼 스튜디오 운영에 필요한 여덟 개 모듈을 한 자리에 모아두었어요.",
  },
  "studio.main:workshop": {
    title: "작업실",
    body: "비공개·작업 중·보관 중인 작품을 관리하는 공간이에요. 공개 스튜디오와는 분리돼 있어요.",
  },
  "studio.main:boards": {
    title: "보드",
    body: "작품이나 전시를 한데 모아 검토·공유하는 묶음이에요. 리뷰·제안·다음 전시 준비에 잘 어울려요.",
  },
  "studio.main:exhibitions": {
    title: "전시",
    body: "이미 진행했거나 진행 중, 또는 예정된 전시를 소개하는 게시물을 만드는 곳이에요.",
  },
  "studio.main:public-works": {
    title: "공개 프로필에 보이는 작품",
    body: "이 탭 줄은 공개 프로필과 맞춰져 있어요. 공개로 두신 작품·전시만 여기서 다루고, 방문자가 프로필에서 처음 보게 되는 구성이에요.",
  },
  "studio.main:portfolio-tabs": {
    title: "탭으로 정리하기",
    body: '탭 옆 순서 변경(↕)으로 순서를 바꾸고, 설정(⚙)에서 기본 탭 이름을 바꾸거나 나만의 탭을 만들고 공개 프로필에 어떤 탭을 보일지 정할 수 있어요. 작품을 선택한 뒤 "탭으로 이동"으로 테마나 카테고리별로 묶을 수도 있어요.',
  },

  "upload.main:tabs": {
    title: "세 가지 업로드 방법",
    body: "지금 공유하려는 내용에 맞는 경로를 골라주세요.",
  },
  "upload.main:single": {
    title: "개별 업로드",
    body: "작품 한 점을 자세히 올리는 경로예요. 제목·사이즈·매체·가격·이야기를 한 번에 기록할 수 있어요.",
  },
  "upload.main:bulk": {
    title: "일괄 업로드",
    body: "여러 점을 한 번에 올리는 경로예요. 보유 작품이나 인벤토리를 한꺼번에 가져올 때 좋아요.",
  },
  "upload.main:exhibition": {
    title: "전시 게시물 만들기",
    body: "전시 전체를 한 페이지에 담아 발행하는 경로예요. 참여 작가·작품·일정·장소가 함께 묶여요.",
  },
  "upload.main:intent": {
    title: "이 작품과 나의 관계는요",
    body: "직접 만든 작품인지, 소유 중인지, 인벤토리에 보관 중인지, 큐레이션 중인지 알려주세요. 알맞은 기록이 자동으로 만들어져요.",
  },

  "exhibition.create:purpose": {
    title: "공유할 수 있는 전시 게시물",
    body: "이미 진행했거나 진행 중, 또는 예정된 전시를 소개하는 게시물이에요. 새 전시를 기획하는 화면은 아니에요.",
  },
  "exhibition.create:dates": {
    title: "언제 열리나요",
    body: "시작일과 종료일을 남기면 컬렉터·큐레이터·방문자가 일정을 알 수 있어요.",
  },
  "exhibition.create:status": {
    title: "전시 상태",
    body: "예정·진행 중·종료 중에서 고르면, 게시물 노출 방식도 자동으로 맞춰져요.",
  },
  "exhibition.create:curator": {
    title: "큐레이터와 호스트",
    body: "전시를 만든 큐레이터와 주최자를 남겨보세요. Abstract 안의 프로필을 바로 연결할 수 있어요.",
  },

  "people.main:search": {
    title: "사람 검색",
    body: "이름이나 @username, 키워드로 작가·컬렉터·큐레이터·갤러리를 찾을 수 있어요.",
  },
  "people.main:lanes": {
    title: "추천 모드",
    body: "내 네트워크가 아는 사람·내 취향과 맞는 사람·새로 만나볼 만한 사람을 따로 보여줘요.",
  },
  "people.main:roles": {
    title: "역할로 좁히기",
    body: "작가·컬렉터·큐레이터·갤러리 중 특정 역할만 남기고 싶을 때 써보세요.",
  },
  "people.main:card": {
    title: "연결 액션",
    body: "팔로우로 가까이 두거나, 첫 인사가 중요한 자리에는 짧은 메시지로 먼저 말을 걸 수 있어요.",
  },

  "delegation.main:what": {
    title: "계정 운영만 함께, 정체성은 그대로",
    body: "신뢰할 수 있는 사람에게 계정 운영을 함께 맡길 수 있어요. 업로드·전시·문의 같은 실무를 나눠도, 나의 정체성은 그대로예요.",
  },
  "delegation.main:invite": {
    title: "협업자 초대",
    body: "Abstract 회원을 바로 초대하거나, 이메일로 새 초대장을 보낼 수 있어요.",
  },
  "delegation.main:received": {
    title: "내게 온 초대",
    body: "다른 사람을 대신해 일해달라는 요청이 이곳에 도착해요. 정말 맡을 것만 수락해 주세요.",
  },
  "delegation.main:sent": {
    title: "내가 만든 위임",
    body: "내가 맡긴 모든 위임은 여기서 보이고, 언제든 회수할 수 있어요. 숨겨진 연결은 없어요.",
  },

  "network.main:tabs": {
    title: "팔로워 · 팔로잉",
    body: "나를 팔로우하는 사람과 내가 팔로우하는 사람을 오가며 볼 수 있어요. 그래프의 두 면이에요.",
  },
  "network.main:search": {
    title: "검색 · 정렬",
    body: "이름으로 좁히거나 최근 순으로 정렬해서 최근에 연결된 사람을 쉽게 찾을 수 있어요.",
  },
  "network.main:list": {
    title: "내 관계 그래프",
    body: "각 줄이 살아있는 연결이에요. 맞팔하거나 스튜디오를 보거나 짧은 메시지로 인사를 건네보세요.",
  },
};

export function tourKoStepKey(tourId: string, stepId: string): string {
  return `${tourId}:${stepId}`;
}
