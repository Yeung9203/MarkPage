/**
 * AI 标签推荐服务
 *
 * 调用用户自配的 AI API（兼容 OpenAI 格式）为书签推荐网站标签。
 * 与 `services/ai.ts` 的"分类"能力互补：
 *   - ai.ts 推断"这是什么类别"（文件夹归属）
 *   - tag-ai.ts 推断"该怎么用/什么主题"（横切标签）
 *
 * 使用示例：
 *   import { suggestTagsForBookmark } from '@/services/tag-ai';
 *   const tags = await suggestTagsForBookmark(bookmark, existingTagNames, aiConfig);
 *   // ['AI', '待读']
 */

import type { Bookmark, AIConfig } from '@/types';
import { isZhUi, t } from '@/utils/i18n';

/** 各 AI 提供商的默认 API 地址 */
const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
};

// ============================================================
// Prompt 构建
// ============================================================

/**
 * 构建 AI 标签推荐的 Prompt（按 UI 语言切换中 / 英文）
 *
 * @param bookmark - 书签信息
 * @param existingTags - 用户已有标签名列表（优先复用）
 * @returns 用于 AI API 的消息数组
 */
function buildSuggestPrompt(
  bookmark: Bookmark,
  existingTags: string[],
): { role: string; content: string }[] {
  if (isZhUi()) {
    const existingText = existingTags.length > 0
      ? existingTags.map((t) => `- ${t}`).join('\n')
      : '（暂无，你可以自由创建）';

    const systemPrompt = `你是一个书签标签推荐助手。请根据网页的标题和 URL，推荐 1-2 个简短的中文通用标签，描述这个网站的"主题/领域"。

核心规则（严格遵守，违反视为失败）：
1. **标签描述"主题/领域"，不是"功能形式"**：
   - 一个 AI 聊天网站 → "AI"，不是"工具"
   - 一个设计灵感网站 → "设计"，不是"工具"
   - 一个开发文档站 → "前端"或"后端"，不是"工具"
   - 一个临时短信验证码网站 → "效率"或"开发"，不是"工具"
2. **"工具"是禁用兜底标签**：绝大多数网站本质都是工具，所以"工具"几乎不携带信息量。除非网站确实是综合性工具集合（如 Excel 在线版、PDF 转换合集），否则**不要**用"工具"，更不要把它当默认值。判断不出贴切主题时，宁可返回 [] 也不要贴"工具"。
3. **倾向复用已有标签，但只在真正贴合时复用**：已有标签里如果有语义贴合的就用它；不贴合的话，新建一个 2-4 字的主题词比硬塞更有价值。不要因为"工具"已存在 N 次就继续往里塞。
4. 标签必须是"粗粒度通用词"，不是"具体技术/产品/功能点"：
   - ✅ 好的标签：前端、后端、设计、AI、学习、娱乐、灵感、资讯、效率、开发、社交、视频、音乐、阅读、购物、金融、新闻
   - ❌ 坏的标签：CSS、iOS、Google、组件库、配色、指南、知识库、网页设计、UX设计、作品集、数据采集
5. 最多返回 2 个标签，1 个通常就够；判断不了主题时**返回空数组 []**，不要硬凑、不要兜底"工具"。
6. 拒绝近义词并列：不要同时返回"后端"和"后台"、"UX"和"UX设计"、"设计灵感"和"设计资源"。
7. 不要生成"状态词"（待读/已看）——那由用户手动决定。

输出格式（严格 JSON 数组，无任何其他文字）：
["标签1"]

判断不了就返回 []。`;

    const userPrompt = `请为以下书签推荐标签：

标题：${bookmark.title}
URL：${bookmark.url}

用户已有的标签：
${existingText}

请返回 JSON 数组。`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  // 英文环境
  const existingText = existingTags.length > 0
    ? existingTags.map((t) => `- ${t}`).join('\n')
    : '(none yet — feel free to create new ones)';

  const systemPrompt = `You are a bookmark tag recommender. Given a page's title and URL, suggest 1-2 short, generic English tags describing the site's "topic / domain".

Core rules (strict — violations count as failure):
1. **Tags describe "topic / domain", not "form / format"**:
   - An AI chat site → "AI", not "Tool"
   - A design inspiration site → "Design", not "Tool"
   - A dev documentation site → "Frontend" or "Backend", not "Tool"
   - A temporary SMS verification site → "Productivity" or "Dev", not "Tool"
2. **"Tool" is a banned fallback tag**: most sites are tools at heart, so "Tool" carries almost no information. Unless the site is genuinely a multi-tool hub (e.g., online Excel, PDF converter collection), do NOT use "Tool", and never treat it as a default. If you can't pin down a topic, return [] rather than tagging "Tool".
3. **Prefer reusing existing tags, but only when they truly fit**: if an existing tag is semantically aligned, use it; otherwise creating a new 1-2 word topic is more valuable than forcing a misfit. Don't keep dumping into "Tool" just because it already has N bookmarks.
4. Tags must be "coarse-grained generic words", not "specific tech / product / feature":
   - ✅ Good: Frontend, Backend, Design, AI, Learning, Entertainment, Inspiration, News, Productivity, Dev, Social, Video, Music, Reading, Shopping, Finance
   - ❌ Bad: CSS, iOS, Google, ComponentLibrary, ColorPalette, Guide, Knowledge, WebDesign, UXDesign, Portfolio, Scraping
5. Return at most 2 tags, usually 1 is enough; if you cannot determine the topic, **return an empty array []**. Don't pad. Don't fall back to "Tool".
6. Reject near-synonyms in parallel: don't return both "Backend" and "Server", "UX" and "UXDesign", "DesignInspiration" and "DesignResources".
7. Don't generate "status words" (ToRead / Read) — those are decided manually by the user.

Output format (strict JSON array, no other text):
["Tag1"]

If undecidable, return [].`;

  const userPrompt = `Please recommend tags for this bookmark:

Title: ${bookmark.title}
URL: ${bookmark.url}

Existing user tags:
${existingText}

Return a JSON array.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

// ============================================================
// API 调用（与 ai.ts 保持一致的鉴权 / 错误处理）
// ============================================================

/**
 * 调用 OpenAI 兼容格式的 Chat API
 *
 * @param messages - 消息数组
 * @param config - AI 配置
 * @returns API 返回的文本内容
 */
async function callChatAPI(
  messages: { role: string; content: string }[],
  config: AIConfig,
  maxTokens: number = 200,
): Promise<string> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URLS[config.provider] ?? '';
  if (!baseUrl) throw new Error(t('ai_error_baseUrlMissing'));
  if (!config.apiKey) throw new Error(t('ai_error_apiKeyMissing'));

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.provider === 'anthropic') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: 0.3,
    max_tokens: maxTokens,
  };

  if (config.provider === 'anthropic') {
    const systemMsg = messages.find((m) => m.role === 'system');
    const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
    if (systemMsg) body.system = systemMsg.content;
    body.messages = nonSystemMsgs;
  }

  const endpoint = `${baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(t('ai_error_httpFailed', [String(response.status)]));
    }

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content ??
      data.content?.[0]?.text ??
      '';
    if (!content) throw new Error(t('ai_error_emptyResponse'));
    return content;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(t('ai_error_timeout'));
    }
    throw error;
  }
}

/**
 * 解析 AI 返回的 JSON 数组
 *
 * @param raw - 原始响应文本
 * @returns 标签名数组（失败返回空数组）
 */
function parseTagArray(raw: string): string[] {
  try {
    let text = raw.trim();

    // 剥离 markdown 代码块
    const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlock) text = codeBlock[1].trim();

    // 提取数组片段
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) text = arrayMatch[0];

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    // 过滤空值、去重、限制个数、限制长度
    const cleaned = parsed
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter((t) => t.length > 0 && t.length <= 12);
    return Array.from(new Set(cleaned)).slice(0, 3);
  } catch (error) {
    console.error('[MarkPage] 解析标签推荐响应失败:', error, '原始文本:', raw);
    return [];
  }
}

// ============================================================
// 核心导出
// ============================================================

/**
 * 为单个书签推荐标签
 *
 * @param bookmark - 书签信息
 * @param existingTagNames - 用户已有标签名列表（用于优先复用）
 * @param config - AI 配置
 * @returns 推荐的标签名数组（最多 3 个，可能为空）
 *
 * 使用示例：
 *   const tags = await suggestTagsForBookmark(bookmark, ['AI', '待读'], aiConfig);
 */
export async function suggestTagsForBookmark(
  bookmark: Bookmark,
  existingTagNames: string[],
  config: AIConfig,
): Promise<string[]> {
  const messages = buildSuggestPrompt(bookmark, existingTagNames);
  const responseText = await callChatAPI(messages, config);
  return parseTagArray(responseText);
}

/**
 * 批量为多个书签推荐标签
 *
 * 逐个调用 suggestTagsForBookmark，每次间隔 500ms 避免限流。
 * 任意一条失败时不会中断整体流程。
 *
 * @param bookmarks - 要推荐标签的书签列表
 * @param existingTagNames - 用户已有标签名列表
 * @param config - AI 配置
 * @param onProgress - 进度回调 (done, total, currentBookmark)
 * @returns 书签 ID → 推荐标签数组
 *
 * 使用示例：
 *   const results = await batchSuggestTags(bookmarks, tags, config, (d, t) => {
 *     console.log(`${d}/${t}`);
 *   });
 */
// ============================================================
// 标签整理（合并近义 / 删除冗余）
// ============================================================

/** 标签整理建议 */
export interface TagCleanupSuggestion {
  /** 合并组：将 sources 中的标签合并到 target */
  merges: { target: string; sources: string[]; reason?: string }[];
  /** 建议删除的标签名（语义无价值 / 过于具体） */
  deletes: { name: string; reason?: string }[];
}

/**
 * 调用 AI 审查现有标签，给出合并 / 删除建议
 *
 * @param tagList - 现有标签（含名称和使用次数）
 * @param config - AI 配置
 * @returns 整理建议（未执行，需调用方确认后执行）
 *
 * 使用示例：
 *   const s = await cleanupTagSuggest(tags, config);
 *   // s.merges: [{ target: '后端', sources: ['后台'] }, ...]
 */
export async function cleanupTagSuggest(
  tagList: { name: string; count: number }[],
  config: AIConfig,
  userDirection?: string,
): Promise<TagCleanupSuggestion> {
  const zh = isZhUi();

  const tagsText = tagList
    .map((t) => zh ? `- ${t.name} (${t.count} 个书签)` : `- ${t.name} (${t.count} bookmarks)`)
    .join('\n');

  const systemPrompt = zh
    ? `你是一个标签整理专家。用户的书签标签粒度混乱、有重复、有过于具体的。你必须积极给出整理方案，**默认假设标签需要大量合并**，除非标签已经全部是通用大类。

核心原则：
**保留的通用大类**（粗粒度，优先把东西往这些里塞）：
  前端、后端、设计、AI、工具、学习、娱乐、资讯、工作、灵感、效率、文档、社交、视频、音乐

规则：
1. **积极合并近义/包含关系**：
   - "设计灵感"、"设计资源"、"网页设计"、"UX"、"UX设计"、"作品集"、"素材"、"配色"、"组件库" → 全部合并到 "设计"
   - "CSS"、"前端相关技术" → 合并到 "前端"
   - "后台" → "后端"
   - "知识库"、"指南"、"学习资源" → "学习"
2. **积极删除过于具体的标签**（特别是只有 1 个书签的具体技术/产品名/单次概念）：
   - 技术名：CSS、iOS、Android、React、Vue
   - 产品名：Google、GitHub、Figma
   - 过细概念：配色、组件库、知识库、指南、终端、折扣、素材、作品集、数据采集、网页设计、设计资源、设计灵感、军事、平台
3. **合并的 target 必须存在**：target 可以是现有标签之一，或常用大类里的通用词（即使现有标签里没有，AI 可以指定新 target，前端会自动创建）
4. **宁可多整理不要保守**：如果 90% 标签都是 1 个书签的具体词，说明整理空间大，给出大量建议
5. **保持语言一致**：用户标签是中文，新生成的 target 也用中文。
6. 严格 JSON 输出，不要任何解释文字

输出格式（示例，仅供格式参考）：
{
  "merges": [
    { "target": "设计", "sources": ["设计灵感", "设计资源", "网页设计", "UX设计", "UX", "作品集"], "reason": "全部归入设计大类" },
    { "target": "前端", "sources": ["CSS"], "reason": "具体技术归入前端" }
  ],
  "deletes": [
    { "name": "配色", "reason": "过细" },
    { "name": "Google", "reason": "产品名" },
    { "name": "军事", "reason": "零散单条" }
  ]
}`
    : `You are a tag-organization expert. The user's bookmark tags have inconsistent granularity, duplicates, and overly specific entries. You must actively propose cleanup — **assume by default that lots of merging is needed**, unless every tag is already a generic top-level category.

Core principles:
**Generic top-level categories to keep** (coarse-grained — prefer routing things into these):
  Frontend, Backend, Design, AI, Tool, Learning, Entertainment, News, Work, Inspiration, Productivity, Docs, Social, Video, Music

Rules:
1. **Aggressively merge synonyms / hyponyms**:
   - "DesignInspiration", "DesignResources", "WebDesign", "UX", "UXDesign", "Portfolio", "Assets", "ColorPalette", "ComponentLibrary" → all merge into "Design"
   - "CSS", "FrontendTech" → merge into "Frontend"
   - "Server" → "Backend"
   - "Knowledge", "Guide", "LearningResources" → "Learning"
2. **Aggressively delete overly specific tags** (especially single-bookmark specific tech / product names / one-off concepts):
   - Tech names: CSS, iOS, Android, React, Vue
   - Product names: Google, GitHub, Figma
   - Over-fine concepts: ColorPalette, ComponentLibrary, Knowledge, Guide, Terminal, Discount, Assets, Portfolio, Scraping, WebDesign, DesignResources, DesignInspiration, Military, Platform
3. **Merge target must be valid**: target can be an existing tag, or a generic top-level word from the list above (even if not currently present — the frontend will auto-create it).
4. **Lean toward more cleanup, not less**: if 90% of tags are 1-bookmark specific words, there's lots of room — return many suggestions.
5. **Match the user's language**: the user's tags are in English, so any new target must also be in English.
6. Strict JSON output, no explanation text.

Output format (example, format only):
{
  "merges": [
    { "target": "Design", "sources": ["DesignInspiration", "DesignResources", "WebDesign", "UXDesign", "UX", "Portfolio"], "reason": "All folded into Design" },
    { "target": "Frontend", "sources": ["CSS"], "reason": "Specific tech folded into Frontend" }
  ],
  "deletes": [
    { "name": "ColorPalette", "reason": "Too specific" },
    { "name": "Google", "reason": "Product name" },
    { "name": "Military", "reason": "One-off entry" }
  ]
}`;

  const directionText = userDirection && userDirection.trim()
    ? (zh
        ? `\n\n⚠️ 用户指定的整理方向（优先遵守）：\n${userDirection.trim()}\n`
        : `\n\n⚠️ User-specified direction (must take precedence):\n${userDirection.trim()}\n`)
    : '';

  const userPrompt = zh
    ? `现有标签列表：
${tagsText}${directionText}

请返回整理建议 JSON。`
    : `Existing tags:
${tagsText}${directionText}

Return the cleanup suggestion JSON.`;

  const responseText = await callChatAPI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    config,
    2000,
  );

  console.log('[MarkPage] AI 整理原始响应:', responseText);
  try {
    let text = responseText.trim();
    const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlock) text = codeBlock[1].trim();
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) text = objMatch[0];
    const parsed = JSON.parse(text);
    const result = {
      merges: Array.isArray(parsed.merges) ? parsed.merges : [],
      deletes: Array.isArray(parsed.deletes) ? parsed.deletes : [],
    };
    console.log('[MarkPage] AI 整理解析结果:', result);
    return result;
  } catch (error) {
    console.error('[MarkPage] 解析整理建议失败:', error, '原始文本:', responseText);
    throw new Error(t('ai_error_cleanupParseFailed'));
  }
}

export async function batchSuggestTags(
  bookmarks: Bookmark[],
  existingTagNames: string[],
  config: AIConfig,
  onProgress?: (done: number, total: number, current: Bookmark) => void,
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  const total = bookmarks.length;

  for (let i = 0; i < total; i++) {
    const bookmark = bookmarks[i];
    try {
      const tags = await suggestTagsForBookmark(bookmark, existingTagNames, config);
      results.set(bookmark.id, tags);
    } catch (error) {
      console.error(`[MarkPage] 批量推荐标签第 ${i + 1}/${total} 项失败:`, error);
      results.set(bookmark.id, []);
    }

    onProgress?.(i + 1, total, bookmark);

    // 最后一次不用延迟
    if (i < total - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}
