import { FC, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  getKeyValue,
  Button,
  Spinner,
  Link,
} from '@nextui-org/react';
import { trpc } from '@web/utils/trpc';
import dayjs from 'dayjs';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useQueryClient } from '@tanstack/react-query';

// 定义文章项的类型
interface ArticleItem {
  id: string;
  title: string;
  publishTime: number;
  summary: string | null;
  hasSummary: boolean;
  isGenerating?: boolean;
  isSyncDB: boolean;
}

const ArticleList: FC = () => {
  const { id } = useParams();
  const mpId = id || '';
  const queryClient = useQueryClient();

  const { data, fetchNextPage, isLoading, hasNextPage } =
    trpc.article.list.useInfiniteQuery(
      {
        limit: 20,
        mpId: mpId,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  const items = useMemo(() => {
    const items = data
      ? data.pages.reduce((acc, page) => [...acc, ...page.items], [] as ArticleItem[])
      : [];

    return items;
  }, [data]);

  const summaryMutation = trpc.article.summarize.useMutation({
    onMutate: async (variables) => {
      // 1. 在mutation开始时就更新UI状态
      console.log('Mutation starting for:', variables.id);
      
      // 2. 取消任何进行中的重新获取
      await queryClient.cancelQueries({
        queryKey: [['article', 'list']],
      });

      // 3. 获取当前数据的快照
      const previousData = queryClient.getQueryData([
        ['article', 'list'],
        { input: { limit: 20, mpId }, type: 'infinite' },
      ]);

      // 4. 立即更新UI显示loading状态
      queryClient.setQueryData(
        [['article', 'list'], { input: { limit: 20, mpId }, type: 'infinite' }],
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              items: page.items.map((item: ArticleItem) =>
                item.id === variables.id
                  ? { ...item, isGenerating: true }
                  : item
              ),
            })),
          };
        }
      );

      return { previousData };
    },

    onSuccess: async (_, variables) => {
      console.log('Mutation succeeded for:', variables.id);
      
      // 5. 成功后更新数据
      queryClient.setQueryData(
        [['article', 'list'], { input: { limit: 20, mpId }, type: 'infinite' }],
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              items: page.items.map((item: ArticleItem) =>
                item.id === variables.id
                  ? { ...item, hasSummary: true, isGenerating: false }
                  : item
              ),
            })),
          };
        }
      );
    },

    onError: (error, variables, context: any) => {
      console.error('Mutation failed:', error);
      
      // 6. 发生错误时恢复之前的数据
      if (context?.previousData) {
        queryClient.setQueryData(
          [['article', 'list'], { input: { limit: 20, mpId }, type: 'infinite' }],
          context.previousData
        );
      }
    },

    onSettled: () => {
      // 7. 完成后刷新数据
      queryClient.invalidateQueries({
        queryKey: [['article', 'list']],
      });
    },
  });

  return (
    <div>
      <Table
        classNames={{
          base: 'h-full',
          table: 'min-h-[420px]',
        }}
        aria-label="文章列表"
        bottomContent={
          hasNextPage && !isLoading ? (
            <div className="flex w-full justify-center">
              <Button
                isDisabled={isLoading}
                variant="flat"
                onPress={() => {
                  fetchNextPage();
                }}
              >
                {isLoading && <Spinner color="white" size="sm" />}
                加载更多
              </Button>
            </div>
          ) : null
        }
      >
        <TableHeader>
          <TableColumn key="title">标题</TableColumn>
          <TableColumn width={180} key="publishTime">
            发布时间
          </TableColumn>
        </TableHeader>
        <TableBody
          isLoading={isLoading}
          emptyContent={'暂无数据'}
          items={items}
          loadingContent={<Spinner />}
        >
          {(item: ArticleItem) => (
            <TableRow key={item.id}>
              {(columnKey) => {
                let value = getKeyValue(item, columnKey);

                if (columnKey === 'publishTime') {
                  value = dayjs(value * 1e3).format('YYYY-MM-DD HH:mm:ss');
                  return <TableCell>{value}</TableCell>;
                }

                if (columnKey === 'title') {
                  const isCurrentItemLoading = 
                    summaryMutation.isLoading && 
                    summaryMutation.variables?.id === item.id;

                  // 添加状态日志
                  console.log('Item state:', {
                    itemId: item.id,
                    mutationLoading: summaryMutation.isLoading,
                    mutationId: summaryMutation.variables?.id,
                    isCurrentItemLoading,
                    hasSummary: item.hasSummary
                  });

                  return (
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm"
                            variant="flat"
                            color={item.hasSummary ? "success" : "primary"}
                            isDisabled={item.hasSummary || (summaryMutation.isLoading && summaryMutation.variables?.id !== item.id)}
                            isLoading={item.isGenerating || (summaryMutation.isLoading && summaryMutation.variables?.id === item.id)}
                            onPress={() => {
                              if (!item.hasSummary && !summaryMutation.isLoading) {
                                console.log('Starting mutation for:', item.id);
                                summaryMutation.mutate({
                                  id: item.id,
                                  url: `https://mp.weixin.qq.com/s/${item.id}`
                                });
                              }
                            }}
                          >
                            {item.hasSummary 
                              ? "已总结" 
                              : (item.isGenerating || (summaryMutation.isLoading && summaryMutation.variables?.id === item.id)
                                  ? "生成摘要中..." 
                                  : "生成摘要"
                                )
                            }
                          </Button>
                          <Link
                            className="visited:text-neutral-400"
                            isBlock
                            showAnchorIcon
                            color="foreground"
                            target="_blank"
                            href={`https://mp.weixin.qq.com/s/${item.id}`}
                          >
                            {value}
                          </Link>
                        </div>
                        {item.summary && (
                          <div className="ml-[72px] rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300 prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown>
                              {item.summary}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  );
                }
                return <TableCell>{value}</TableCell>;
              }}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ArticleList;
