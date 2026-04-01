import type { DataProvider, Article } from "../data/types.js";

type Input = {
  protocol?: string;
  category?: string;
  days?: number;
  limit?: number;
};
type Output = {
  articles: Article[];
  count: number;
  data_as_of: string;
};

export function getMarketNews(provider: DataProvider, input: Input): Output {
  const articles = provider.getArticles({
    protocol: input.protocol,
    category: input.category,
    days: input.days,
    limit: input.limit,
  });
  return {
    articles,
    count: articles.length,
    data_as_of: provider.getDataTimestamp(),
  };
}
