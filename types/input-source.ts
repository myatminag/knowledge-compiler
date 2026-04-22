export type InputType =
  | "raw_text"
  | "url"
  | "pdf"
  | "youtube"
  | "github_repo"
  | "rss";

export interface InputSource {
  type: InputType;
  content: string;
  title?: string;
}
