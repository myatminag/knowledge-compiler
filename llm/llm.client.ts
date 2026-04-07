import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function callLLM(input: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
          You are a knowledge compiler.

          You transform raw content into structured, reusable knowledge.

          Rules:
          - Return ONLY valid JSON
          - No markdown, no explanations
          - Do not hallucinate unknown facts
          - Keep concepts atomic and reusable
          - Avoid duplicates and vague wording
                  `,
      },
      {
        role: "user",
        content: `
          Convert the following content into structured JSON.

          Schema:
          {
            title: string,
            tags: string[],
            summary: string,
            keyConcepts: string[],
            deepDive: string,
            related: string[],
            openQuestions: string[]
          }

          Rules:
          - keyConcepts must be reusable (not sentences)
          - related must be short titles (for [[linking]])
          - Keep concise and precise

          Content:
          ${input}
        `,
      },
    ],
  });

  const content = response.choices[0].message.content;

  if (!content) {
    throw new Error("Empty response from LLM");
  }

  return content;
}
