import { UserFacingError } from "@/domain/errors";
import { articles } from "@/fixtures/articles";
import type {
  Answer,
  LearningItem,
  MaterialProvider,
  Quiz,
  TutorAdapter,
} from "@/domain/types";
export function parseTitle(input: string): string {
  const value = input.trim();
  if (!value || value.length > 2048)
    throw new UserFacingError("제목 또는 URL을 1~2,048자로 입력해 주세요.");
  let title = value;
  if (/^(https?:|\/\/|www\.)/i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new UserFacingError("올바른 HTTPS Wikipedia URL을 입력해 주세요.");
    }
    if (
      url.protocol !== "https:" ||
      !["simple.wikipedia.org", "simple.m.wikipedia.org"].includes(
        url.hostname,
      ) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      !url.pathname.startsWith("/wiki/")
    )
      throw new UserFacingError("Simple English Wikipedia의 /wiki/ 문서 URL만 지원해요.");
    try {
      title = decodeURIComponent(url.pathname.slice(6)).replace(/_/g, " ");
    } catch {
      throw new UserFacingError("URL의 문자 인코딩을 확인해 주세요.");
    }
  }
  if (!title.trim() || title.length > 255 || /[:/#?]/.test(title))
    throw new UserFacingError("일반 문서 제목을 255자 이내로 입력해 주세요.");
  return title.trim();
}
export class MockWikipediaProvider implements MaterialProvider {
  resolve(input: string) {
    const title = parseTitle(input).toLowerCase();
    const match = articles.find(
      (a) => a.title.toLowerCase() === title || a.id === title,
    );
    return (
      match ??
      articles.filter((a) => a.title.toLowerCase().includes(title)).slice(0, 5)
    );
  }
}
const entries = [
  {
    key: "home to",
    expression: "be home to",
    meaning: "~의 서식지이다 / ~이 있는 곳이다",
    translation: "그곳에는 다양한 생물이나 지형이 있습니다.",
    explanation:
      "be home to는 집이라는 뜻을 넓혀, 어떤 생물이나 사물이 존재하는 곳을 나타냅니다. 뒤에는 그곳에 있는 대상이 와요.",
    en: "This forest is home to many birds.",
    ko: "이 숲에는 많은 새들이 살고 있어요.",
    role: "서식지·소재지를 나타내는 표현",
    wrong: ["~로 이사하다", "~에서 집을 사다"],
  },
  {
    key: "depend on",
    expression: "depend on",
    meaning: "~에 의존하다",
    translation:
      "사람이나 생물은 필요한 것을 얻기 위해 다른 대상에 의존합니다.",
    explanation:
      "depend on 뒤에는 의지하거나 필요로 하는 대상이 옵니다. 문맥에 따라 “~에 달려 있다”라는 뜻으로도 쓸 수 있어요.",
    en: "Plants depend on sunlight to grow.",
    ko: "식물은 자라기 위해 햇빛에 의존해요.",
    role: "의존 관계를 나타내는 동사구",
    wrong: ["~을 피하다", "~을 대신하다"],
  },
  {
    key: "able to",
    expression: "be able to",
    meaning: "~할 수 있다",
    translation: "어떤 환경에서 살거나 특정 행동을 할 수 있습니다.",
    explanation:
      "be able to 다음에는 동사 원형이 와요. 능력이나 가능함을 나타내며 주어와 시제에 따라 be가 변합니다.",
    en: "I am able to read this article.",
    ko: "나는 이 글을 읽을 수 있어요.",
    role: "능력을 나타내는 표현",
    wrong: ["~해야 한다", "~하곤 했다"],
  },
  {
    key: "were formed",
    expression: "were formed",
    meaning: "형성되었다",
    translation:
      "히말라야는 지표의 커다란 두 조각이 서로를 향해 움직이면서 형성되었습니다.",
    explanation:
      "were + 과거분사 formed는 과거 수동태예요. 산맥이 스스로 만드는 것이 아니라 지각 운동에 의해 만들어졌다는 데 초점을 둡니다.",
    en: "These rocks were formed a long time ago.",
    ko: "이 암석들은 아주 오래전에 형성되었어요.",
    role: "과거 수동태",
    wrong: ["형성할 것이다", "스스로 형성한다"],
  },
  {
    key: "play an important role",
    expression: "play an important role",
    meaning: "중요한 역할을 하다",
    translation: "이러한 대상은 사람들의 삶이나 자연에서 중요한 역할을 합니다.",
    explanation:
      "play a role은 역할을 한다는 뜻이에요. important는 그 역할이 중요함을 강조하고, in 뒤에는 영향을 미치는 분야나 상황이 옵니다.",
    en: "Sleep plays an important role in learning.",
    ko: "수면은 학습에서 중요한 역할을 해요.",
    role: "역할을 나타내는 동사구",
    wrong: ["놀이를 즐기다", "역할을 포기하다"],
  },
];
function entry(item: LearningItem) {
  return entries.find((e) => item.quote.toLowerCase().includes(e.key));
}
export class MockTutorAdapter implements TutorAdapter {
  explain(item: LearningItem): Answer {
    if (!item.unknown && !item.submittedGuess?.trim())
      throw new UserFacingError(
        "먼저 내 추측을 입력하거나 아직 모르겠어요를 선택해 주세요.",
      );
    if (item.tutorContext?.source.provider === "simple_wikipedia")
      throw new UserFacingError(
        "선택한 원문과 문맥은 Tutor에 전달됐어요. 실제 AI 설명은 OpenAI 연결 단계에서 제공됩니다.",
      );
    const e = entry(item);
    if (!e)
      throw new UserFacingError(
        "이 선택 범위에는 준비된 Mock 설명이 없어요. 본문의 밑줄 표현이나 문단 질문 버튼을 선택해 주세요.",
      );
    return {
      provider: "mock",
      translationKo: e.translation,
      explanationKo: e.explanation,
      expression: e.expression,
      meaning: e.meaning,
      chunks: [{ text: e.expression, role: e.role }],
      examples: [{ en: e.en, ko: e.ko }],
      feedback: item.unknown
        ? "괜찮아요. 설명을 읽고 자신의 말로 다시 떠올려 보세요."
        : "Mock 모드는 추측을 자동으로 평가하지 않아요. 아래 설명과 내 추측을 직접 비교해 보세요.",
    };
  }
  quiz(item: LearningItem): Quiz {
    const e = entry(item);
    if (!e || !item.answer) throw new UserFacingError("설명을 먼저 확인해 주세요.");
    return {
      prompt: `문맥에서 “${e.expression}”의 뜻은 무엇인가요?`,
      options: [
        { id: "a", text: e.wrong[0] },
        { id: "b", text: e.meaning },
        { id: "c", text: e.wrong[1] },
      ],
      correctId: "b",
      explanation: e.explanation,
    };
  }
  followup(item: LearningItem, question: string) {
    return `“${question}”에 대한 자유 응답은 실제 API 연결 후 제공됩니다. 지금은 고정 예시를 보여 드려요. ${item.answer?.examples[0].en ?? ""} — ${item.answer?.explanationKo ?? ""}`;
  }
}
