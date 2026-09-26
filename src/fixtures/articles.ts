import type { Article } from "@/domain/types";
// Original writing for UI testing. Never represented as retrieved Wikipedia text.
export const articles: Article[] = [
  {
    id: "himalayas",
    title: "Himalayas",
    topic: "Geography · Nature",
    description:
      "세계의 지붕, 히말라야. 산맥이 만들어지는 과정과 그곳의 삶을 읽어 보세요.",
    sourceUrl: "https://simple.wikipedia.org/wiki/Himalayas",
    notice:
      "앱 화면 검증을 위해 직접 작성한 Mock 본문입니다. Wikipedia에서 가져온 원문이 아닙니다.",
    blocks: [
      {
        id: "h-1",
        heading: "The roof of the world",
        text: "The Himalayas are a mountain range in Asia. They are home to some of the highest mountains in the world, including Mount Everest. The mountains stretch across several countries and form a natural boundary between different regions.",
      },
      {
        id: "h-2",
        heading: "How the mountains formed",
        text: "The Himalayas were formed when two large pieces of the Earth’s surface moved towards each other. Over millions of years, the land was pushed upwards. The mountains are still rising, although the change is too small to see in everyday life.",
      },
      {
        id: "h-3",
        heading: "Life in the mountains",
        text: "Many people live in the valleys of the Himalayas. They depend on rivers for water and grow crops on the lower slopes. As the altitude increases, the air becomes colder and fewer plants are able to survive.",
      },
      {
        id: "h-4",
        heading: "A source of water",
        text: "Snow and ice high in the mountains provide water for some of Asia’s great rivers. When the snow melts, water flows down into the valleys. These rivers play an important role in the lives of people far away from the mountains.",
      },
    ],
  },
  {
    id: "bird",
    title: "Bird",
    topic: "Animals · Nature",
    description:
      "가벼운 날개부터 계절에 따른 이동까지, 새들의 일상을 읽어 보세요.",
    sourceUrl: "https://simple.wikipedia.org/wiki/Bird",
    notice: "앱 화면 검증용 창작 Mock 본문이며 Wikipedia 원문이 아닙니다.",
    blocks: [
      {
        id: "b-1",
        heading: "A world of birds",
        text: "Birds are animals with feathers and wings. They are able to live in many different places, from warm forests to cold mountains. Most birds can fly, but some spend their lives on the ground or in the water.",
      },
      {
        id: "b-2",
        heading: "Finding food",
        text: "Different birds eat different kinds of food. Some depend on seeds and fruit, while others catch insects or fish. Their beaks help them find and eat the food they need.",
      },
      {
        id: "b-3",
        heading: "Moving with the seasons",
        text: "Many birds travel long distances when the seasons change. They move towards warmer places where food is easier to find. This journey is called migration.",
      },
    ],
  },
  {
    id: "ocean",
    title: "Ocean",
    topic: "Science · Nature",
    description: "넓고 깊은 바다와 그 안에서 서로 연결된 생명들을 만나 보세요.",
    sourceUrl: "https://simple.wikipedia.org/wiki/Ocean",
    notice: "앱 화면 검증용 창작 Mock 본문이며 Wikipedia 원문이 아닙니다.",
    blocks: [
      {
        id: "o-1",
        heading: "Our blue planet",
        text: "The ocean covers a large part of the Earth. It is home to many kinds of plants and animals. Some live near the surface, while others live in deep, dark water.",
      },
      {
        id: "o-2",
        heading: "Water in motion",
        text: "Ocean water is always moving. Winds push water across the surface and create waves. These movements play an important role in carrying heat around the world.",
      },
      {
        id: "o-3",
        heading: "Life below the surface",
        text: "Many small animals depend on tiny plants for food. Larger animals eat the smaller ones. All of these living things are connected, and changes in one part can affect the others.",
      },
    ],
  },
];
