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
          Return ONLY valid JSON.
          No markdown. No explanations. No extra text.
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
          - Follow schema exactly
          - Keep answers concise and precise
          - Do not hallucinate unknown facts

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

  console.log("LLM RAW OUTPUT:", content);

  return content;
}
