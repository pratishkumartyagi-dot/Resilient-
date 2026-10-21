export interface ThesisOutline {
  title: string;
  abstract: string;
  chapters: Chapter[];
}

export interface Chapter {
  number: number;
  title: string;
  sections: Section[];
  wordTarget?: number;
}

export interface Section {
  id: string;
  title: string;
  wordTarget?: number;
  content?: string;
}
