export type InputType = "raw_text" | "url" | "pdf";

export type InputSource = {
  type: InputType;
  content: string;
};
