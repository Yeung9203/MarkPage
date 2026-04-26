/**
 * AI 分类服务
 *
 * 调用用户自配的第三方 AI API（兼容 OpenAI 格式）对书签进行自动分类。
 * 支持 OpenAI、Anthropic、DeepSeek 及自定义 API 端点。
 *
 * 使用示例：
 *   import { classify } from '@/services/ai';
 *   const result = await classify(bookmark, categories, aiConfig);
 *   console.log(result.category, result.confidence);
 */

import type { Bookmark, Category, AIConfig, ClassifyResult } from '@/types';
import { get, set } from '@/services/storage';
import { isZhUi, t } from '@/utils/i18n';

/** 各 AI 提供商的默认 API 地址 */
const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
};

/** 分类历史记录存储键 */
const CLASSIFY_HISTORY_KEY = 'markpage_classify_history';

/** AI 服务自抛的、已用 i18n 包装好用户友好文案的错误标记类 */
class AIServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIServiceError';
  }
}

/** 分类历史记录条目 */
interface ClassifyHistoryEntry {
  /** 书签标题 */
  title: string;
  /** 书签 URL */
  url: string;
  /** 用户确认的分类 */
  category: string;
  /** 记录时间戳 */
  timestamp: number;
}

// ============================================================
// Prompt 构建
// ============================================================

/**
 * 从 URL 提取主机名（用于在 prompt 中给 AI 提供更显式的语义线索）
 *
 * @param url - 完整 URL
 * @returns hostname，解析失败返回原 url
 */
function extractHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * 构建 AI 分类的 Prompt
 *
 * 包含以下内容：
 *   1. 系统角色描述（书签分类助手 + 反"硬塞已有分类"指引）
 *   2. 用户分类树（已有分类列表）
 *   3. few-shot 样本（最近用户确认的分类记录）
 *   4. 待分类的网页信息（title + URL + host）
 *   5. 输出格式约定（JSON，含 reasoning 字段强制简短推理）
 *
 * @param bookmark - 书签信息
 * @param categories - 已有分类列表
 * @param history - 历史分类记录（用作 few-shot 样本）
 * @returns 用于 AI API 的消息数组
 */
function buildClassifyPrompt(
  bookmark: Bookmark,
  categories: Category[],
  history: ClassifyHistoryEntry[] = [],
): { role: string; content: string }[] {
  const zh = isZhUi();
  const host = extractHost(bookmark.url);

  // 序列化分类树为可读文本
  const categoryList = categories
    .map((c) => {
      const countLabel = (n: number) => zh ? `${n} 个书签` : `${n} bookmarks`;
      let line = `- ${c.name} (${countLabel(c.count)})`;
      if (c.children && c.children.length > 0) {
        const childLines = c.children.map((ch) => `  - ${ch.name} (${countLabel(ch.count)})`);
        line += '\n' + childLines.join('\n');
      }
      return line;
    })
    .join('\n');

  // 构建 few-shot 样本（最近 20 条）
  const recentHistory = history.slice(-20);
  let fewShotText = '';
  if (recentHistory.length > 0) {
    const header = zh
      ? '\n\n以下是用户之前确认的分类记录，作为参考（仅供参考，不要盲从）：\n'
      : '\n\nUser-confirmed classifications from earlier (reference only, do not blindly follow):\n';
    fewShotText =
      header +
      recentHistory
        .map((h) => `- "${h.title}" (${h.url}) → ${h.category}`)
        .join('\n');
  }

  if (zh) {
    const systemPrompt = `你是一个严谨的书签分类助手。你的任务是根据网页的"标题 + URL（特别是域名）"判断它的真实用途，并归入最贴切的分类。

判断流程（必须按顺序思考）：
1. 先看标题里的"品牌名"，再看 URL 域名（host）——两者结合判断网站的核心用途。这是最重要的依据。
2. 检查已有分类列表，**仅当**已有分类的语义和该网站的核心用途明确吻合时，才复用它。
3. 如果所有已有分类都对不上，**必须**通过 newCategory 字段建议一个新分类，**绝不要为了"用上已有分类"而硬塞**。
4. 输出前自检：相似产品（如同样是 AI 助手的 ChatGPT 和 Claude）应当归到**同一类**——若 few-shot 中已有此类先例，必须保持一致。

【品牌词 → 类别】（标题里出现这些词，几乎一定属于对应类别，**优先级高于域名**）：
- AI 工具：ChatGPT / Claude / Gemini / Bard / Copilot / Perplexity / Kimi / 通义 / 文心 / Grok / DeepSeek / Midjourney / DALL·E / Stable Diffusion / Runway / Sora / Suno
- 设计工具：Figma / Sketch / Framer / Adobe XD / Canva / Photoshop / Illustrator
- 开发：GitHub / GitLab / Stack Overflow / npm / MDN / VSCode / 掘金（juejin）
- 视频/影音：YouTube / Bilibili / Netflix / 优酷 / 爱奇艺 / Twitch
- 社交媒体：X / Twitter / 微博 / 小红书 / Threads / Instagram / Facebook / TikTok / 抖音
- 社区论坛：Reddit / V2EX / Hacker News / 贴吧 / Quora
- 邮箱：Gmail / Outlook / QQ 邮箱 / 网易邮箱 / Inbox
- 生产力：Notion / Linear / Asana / Trello / 飞书 / 钉钉 / Slack
- 云服务：AWS / Azure / GCP / Vercel / Netlify / Cloudflare / 腾讯云 / 阿里云

【常见误判，避免】：
- "ChatGPT / Claude" 中的 "Chat" 不是"聊天娱乐"，它们是 **AI 工具**。
- "YouTube Music"、"Spotify" 是音乐，不是视频。
- "Linear"（项目管理）不是"线性代数"也不是开发工具，是**生产力**。
- "Discord" 是社交/社区，不是开发。
- 个人博客 / 教程文章 不要因为"标题含技术词"就塞到 Developer——它们应是"学习资源"或"博客"。

硬性规则：
- 不要因为"已有分类里数量最多"或"已有分类里没有更合适的"就硬塞——这种情况一律 newCategory。
- confidence 表示"分到这一类的把握"：勉强、不确定时给 0.4 以下，明显合适给 0.85 以上。
- 分类名与用户使用语言一致（用户用中文则中文、英文则英文）。
- 严格输出 JSON，不要包含任何额外文字。

输出格式：
{
  "reasoning": "一句话说明为什么分到这一类（≤30 字，关键看品牌词/域名）",
  "category": "推荐的分类名称",
  "confidence": 0.95,
  "alternatives": [
    { "category": "备选分类1", "confidence": 0.7 }
  ],
  "newCategory": null
}

如果建议新分类，把 category 设为新名称，并把 newCategory 也设为同一名称。`;

    const userPrompt = `请为以下书签分类。先看域名判断核心用途，再决定是复用已有分类还是建议新分类。

标题：${bookmark.title}
URL：${bookmark.url}
域名：${host}

当前已有的分类列表（数量越多 ≠ 越合适，看语义是否吻合）：
${categoryList || '（暂无分类）'}${fewShotText}

请返回 JSON 格式的分类结果。`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  // 英文环境
  const systemPrompt = `You are a rigorous bookmark categorization assistant. Decide a bookmark's true purpose from its title and URL (especially the host), then place it in the best-fitting category.

Decision process (follow in order):
1. First scan the title for a brand name; then read the URL host. Together they reveal the site's core purpose — this is the primary signal.
2. Check the existing categories. Only reuse one when its semantics CLEARLY match the site's core purpose.
3. If no existing category fits, you MUST propose a new one via newCategory. Never force-fit just to reuse an existing folder.
4. Self-check before answering: similar products (e.g., ChatGPT and Claude are both AI assistants) MUST land in the SAME category. If the few-shot history already classified one, stay consistent.

[Brand name → category] (when these appear in the title, they almost certainly belong to the listed category — overrides host hints):
- AI Tools: ChatGPT / Claude / Gemini / Bard / Copilot / Perplexity / Kimi / Grok / DeepSeek / Midjourney / DALL·E / Stable Diffusion / Runway / Sora / Suno
- Design Tools: Figma / Sketch / Framer / Adobe XD / Canva / Photoshop / Illustrator
- Developer: GitHub / GitLab / Stack Overflow / npm / MDN / VSCode
- Video / Entertainment: YouTube / Bilibili / Netflix / Twitch
- Social: X / Twitter / Threads / Instagram / Facebook / TikTok
- Community: Reddit / Hacker News / Quora / V2EX
- Email: Gmail / Outlook / Inbox
- Productivity: Notion / Linear / Asana / Trello / Slack
- Cloud: AWS / Azure / GCP / Vercel / Netlify / Cloudflare

[Common pitfalls to avoid]:
- "Chat" in "ChatGPT" / "Claude" does NOT mean "chat entertainment" — they are AI Tools.
- "YouTube Music" / "Spotify" → Music, not Video.
- "Linear" (project management) is NOT linear-algebra or a dev tool — it's Productivity.
- "Discord" is Social/Community, not Developer.
- A personal blog or tutorial article should NOT be force-fitted to Developer just because the title contains a tech term — use Learning/Blog instead.

Hard rules:
- Don't force-fit because "the existing categories have the most items there" or "nothing else is closer." In that case, propose newCategory.
- confidence reflects how sure the category is right: shaky/uncertain → below 0.4; clearly right → above 0.85.
- Output language matches the user's existing categories.
- Output STRICT JSON only, no extra text.

Output format:
{
  "reasoning": "one short sentence (<= 20 words) on why this category, focusing on brand/host",
  "category": "recommended category name",
  "confidence": 0.95,
  "alternatives": [
    { "category": "alternative 1", "confidence": 0.7 }
  ],
  "newCategory": null
}

When suggesting a new category, set both category and newCategory to the same name.`;

  const userPrompt = `Categorize this bookmark. First identify core purpose from the host, then decide reuse vs. new category.

Title: ${bookmark.title}
URL: ${bookmark.url}
Host: ${host}

Current categories (more items != better fit; only reuse when semantics match):
${categoryList || '(none yet)'}${fewShotText}

Return the JSON result.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

// ============================================================
// API 调用
// ============================================================

/**
 * 调用 OpenAI 兼容格式的 Chat API
 *
 * 支持 OpenAI、DeepSeek 及其他兼容 OpenAI 格式的 API。
 * 对 Anthropic 适配了不同的请求 header 格式。
 *
 * @param messages - 消息数组
 * @param config - AI 配置
 * @returns API 返回的文本内容
 *
 * @throws Error 网络错误、认证失败、限流等
 */
async function callChatAPI(
  messages: { role: string; content: string }[],
  config: AIConfig,
): Promise<string> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URLS[config.provider] ?? '';

  if (!baseUrl) {
    throw new AIServiceError(t('ai_error_baseUrlMissing'));
  }

  if (!config.apiKey) {
    throw new AIServiceError(t('ai_error_apiKeyMissing'));
  }

  // 构建请求 header
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Anthropic 使用不同的认证 header
  if (config.provider === 'anthropic') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // 构建请求体
  // temperature 0.1：分类任务追求一致性，降低随机性减少误判
  // max_tokens 600：留出空间给新增的 reasoning 字段
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: 0.1,
    max_tokens: 600,
  };

  // Anthropic 格式适配：将 system 消息从 messages 中提取出来
  if (config.provider === 'anthropic') {
    const systemMsg = messages.find((m) => m.role === 'system');
    const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
    if (systemMsg) {
      body.system = systemMsg.content;
    }
    body.messages = nonSystemMsgs;
  }

  const endpoint = `${baseUrl}/chat/completions`;

  try {
    // 设置 10 秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const statusCode = response.status;
      if (statusCode === 401) {
        throw new AIServiceError(t('ai_error_apiKeyInvalid'));
      } else if (statusCode === 429) {
        throw new AIServiceError(t('ai_error_rateLimited'));
      } else if (statusCode === 402 || statusCode === 403) {
        throw new AIServiceError(t('ai_error_quotaExhausted'));
      } else {
        throw new AIServiceError(t('ai_error_httpFailed', [String(statusCode)]));
      }
    }

    const data = await response.json();

    // 提取返回内容
    const content =
      data.choices?.[0]?.message?.content ??
      data.content?.[0]?.text ?? // Anthropic 格式
      '';

    if (!content) {
      throw new AIServiceError(t('ai_error_emptyResponse'));
    }

    return content;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new AIServiceError(t('ai_error_timeout'));
    }
    // 已用 i18n 包装好用户友好文案的错误原样向上抛
    if (error instanceof AIServiceError) throw error;
    throw new AIServiceError(t('ai_error_networkFailed', [(error as Error).message]));
  }
}

// ============================================================
// 核心分类函数
// ============================================================

/**
 * 对单个书签进行 AI 分类
 *
 * 流程：
 *   1. 获取历史分类记录作为 few-shot 样本
 *   2. 构建分类 Prompt
 *   3. 调用 AI API
 *   4. 解析 JSON 响应为 ClassifyResult
 *
 * @param bookmark - 要分类的书签
 * @param existingCategories - 已有的分类列表
 * @param config - AI 配置
 * @returns 分类结果（包含推荐分类、置信度和备选方案）
 *
 * 使用示例：
 *   const result = await classify(
 *     { id: '1', title: 'GitHub', url: 'https://github.com' },
 *     [{ id: '1', name: '开发工具', count: 5 }],
 *     aiConfig,
 *   );
 *   console.log(result);
 *   // { category: '开发工具', confidence: 0.95, alternatives: [...] }
 */
export async function classify(
  bookmark: Bookmark,
  existingCategories: Category[],
  config: AIConfig,
): Promise<ClassifyResult> {
  try {
    // 获取历史分类记录
    const history = await getClassifyHistory();

    // 构建 Prompt
    const messages = buildClassifyPrompt(bookmark, existingCategories, history);

    // 调用 AI API
    const responseText = await callChatAPI(messages, config);

    // 解析 JSON 响应
    const result = parseClassifyResponse(responseText);
    return result;
  } catch (error) {
    console.error('[MarkPage] AI 分类失败:', error);
    throw error;
  }
}

/**
 * 解析 AI 返回的 JSON 响应为 ClassifyResult
 *
 * @param responseText - AI 返回的原始文本
 * @returns 解析后的分类结果
 */
function parseClassifyResponse(responseText: string): ClassifyResult {
  try {
    // 尝试从文本中提取 JSON（AI 可能在 JSON 前后加了解释文字）
    let jsonStr = responseText.trim();

    // 如果包含 markdown 代码块标记，提取其中的 JSON
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // 尝试找到 JSON 对象
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    return {
      category: parsed.category || (isZhUi() ? '未分类' : 'Uncategorized'),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      alternatives: Array.isArray(parsed.alternatives)
        ? parsed.alternatives.map((alt: { category?: string; confidence?: number }) => ({
            category: alt.category || '',
            confidence: typeof alt.confidence === 'number' ? alt.confidence : 0,
          }))
        : [],
      newCategory: parsed.newCategory || undefined,
    };
  } catch (error) {
    console.error('[MarkPage] 解析 AI 响应失败:', error, '原始文本:', responseText);
    throw new AIServiceError(t('ai_error_parseFailed'));
  }
}

/**
 * 批量分类书签
 *
 * 逐个调用 classify，每次调用间隔 500ms 避免 API 限流
 *
 * @param bookmarks - 要分类的书签列表
 * @param existingCategories - 已有分类列表
 * @param config - AI 配置
 * @param onProgress - 进度回调（当前完成数, 总数）
 * @returns 分类结果映射（书签 ID → 分类结果）
 *
 * 使用示例：
 *   const results = await batchClassify(bookmarks, categories, config, (done, total) => {
 *     console.log(`进度: ${done}/${total}`);
 *   });
 */
export async function batchClassify(
  bookmarks: Bookmark[],
  existingCategories: Category[],
  config: AIConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, ClassifyResult>> {
  const results = new Map<string, ClassifyResult>();
  const total = bookmarks.length;

  for (let i = 0; i < total; i++) {
    const bookmark = bookmarks[i];

    try {
      const result = await classify(bookmark, existingCategories, config);
      results.set(bookmark.id, result);
    } catch (error) {
      console.error(`[MarkPage] 批量分类第 ${i + 1}/${total} 项失败:`, error);
      // 分类失败时设置默认结果，继续处理下一个
      results.set(bookmark.id, {
        category: isZhUi() ? '未分类' : 'Uncategorized',
        confidence: 0,
        alternatives: [],
      });
    }

    // 通知进度
    onProgress?.(i + 1, total);

    // 限流延迟：非最后一个时等待 500ms
    if (i < total - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

// ============================================================
// API 验证
// ============================================================

/**
 * 验证 AI 配置是否有效（可连通）
 *
 * 发送一个简单的测试请求验证 API Key 和连接
 *
 * @param config - AI 配置
 * @returns 是否验证通过
 *
 * 使用示例：
 *   const isValid = await validateConfig(aiConfig);
 *   if (!isValid) console.error('AI 配置无效');
 */
export async function validateConfig(config: AIConfig): Promise<boolean> {
  try {
    const testMessages = [
      { role: 'user', content: '请回复"OK"' },
    ];

    const response = await callChatAPI(testMessages, config);
    // 只要收到了有效响应就认为配置有效
    return response.length > 0;
  } catch (error) {
    console.error('[MarkPage] API 验证失败:', error);
    return false;
  }
}

// ============================================================
// 分类历史管理
// ============================================================

/**
 * 保存用户确认的分类记录
 *
 * @param bookmark - 已分类的书签
 * @param category - 用户确认的分类名称
 *
 * 使用示例：
 *   await saveClassifyHistory(bookmark, '开发工具');
 */
export async function saveClassifyHistory(
  bookmark: Bookmark,
  category: string,
): Promise<void> {
  try {
    const history = await getClassifyHistory();

    // 添加新记录
    history.push({
      title: bookmark.title,
      url: bookmark.url,
      category,
      timestamp: Date.now(),
    });

    // 只保留最近 50 条记录
    const trimmed = history.slice(-50);

    await set(CLASSIFY_HISTORY_KEY, trimmed);
  } catch (error) {
    console.error('[MarkPage] 保存分类历史失败:', error);
  }
}

/**
 * 获取最近的分类历史记录
 *
 * @returns 分类历史记录列表（最近 20 条）
 *
 * 使用示例：
 *   const history = await getClassifyHistory();
 *   console.log(history.length); // 最多 20 条
 */
export async function getClassifyHistory(): Promise<ClassifyHistoryEntry[]> {
  try {
    const history = await get<ClassifyHistoryEntry[]>(CLASSIFY_HISTORY_KEY);
    return history ?? [];
  } catch (error) {
    console.error('[MarkPage] 获取分类历史失败:', error);
    return [];
  }
}
