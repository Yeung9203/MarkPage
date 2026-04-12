/**
 * 网站标签种子推荐
 *
 * 仅作为"首次引导导入"时的种子标签建议使用。
 * 不再在书签加载时自动套用到 Bookmark.tags。
 *
 * 使用示例：
 *   import { getSuggestedSeedTags } from '@/utils/tags';
 *   const seeds = getSuggestedSeedTags('GitHub');
 *   // ['代码托管']
 */

/** 书签标题 → 推荐种子标签名数组 */
export const RECOMMENDED_TAG_SEEDS: Record<string, string[]> = {
  GitHub: ['代码托管'],
  Vercel: ['部署'],
  Linear: ['项目管理'],
  Netlify: ['部署'],
  CodePen: ['在线编辑'],
  StackOverflow: ['问答'],
  'Stack Overflow': ['问答'],
  'MDN Web Docs': ['Web 标准'],
  'React Documentation': ['框架'],
  'Next.js Docs': ['框架'],
  'Tailwind CSS': ['样式'],
  'TypeScript Handbook': ['语言'],
  Figma: ['设计工具'],
  Dribbble: ['灵感'],
  Awwwards: ['灵感'],
  Claude: ['对话'],
  ChatGPT: ['对话'],
  Midjourney: ['图像生成'],
  'Twitter / X': ['社交'],
  知乎: ['问答'],
  微博: ['社交'],
  V2EX: ['社区'],
  YouTube: ['视频'],
  Bilibili: ['视频'],
  Spotify: ['音乐'],
  Notion: ['工具'],
  Slack: ['协作'],
  Gmail: ['邮件'],
  掘金: ['技术社区'],
  Google: ['搜索引擎'],
};

/**
 * 根据书签标题获取推荐的种子标签名数组
 *
 * 仅用于"首次引导导入"流程，不再自动写入书签。
 *
 * @param title - 书签标题
 * @returns 推荐标签名数组（可能为空）
 *
 * 使用示例：
 *   getSuggestedSeedTags('GitHub'); // ['代码托管']
 *   getSuggestedSeedTags('未知站点'); // []
 */
export function getSuggestedSeedTags(title: string): string[] {
  const mapped = RECOMMENDED_TAG_SEEDS[title];
  return mapped ? [...mapped] : [];
}
