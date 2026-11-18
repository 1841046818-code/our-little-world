const dayNumber = date => Date.parse(`${date}T00:00:00Z`) / 86400000;

export const getCareSuggestion = (records, today, hour) => {
  const starts = [...new Set(records
    .filter(record => record.status === 'period' && record.date <= today)
    .map(record => record.date))].sort();
  const recentNote = records.some(record => record.status !== 'period' && dayNumber(today) - dayNumber(record.date) <= 3 && dayNumber(today) >= dayNumber(record.date));
  const greeting = hour < 11 ? '早上' : hour < 14 ? '中午' : hour < 18 ? '下午' : '晚上';
  const opening = `${greeting}可以轻轻问她一句：`;

  if (!starts.length) {
    return {
      title: '先从一次轻松的记录开始',
      detail: '现在还没有经期开始记录，所以暂时不推测周期。她愿意的时候，记下开始日期就好。',
      message: `${opening}“今天感觉怎么样？有需要我帮忙的地方吗？”`,
      estimate: null,
    };
  }

  const latest = starts.at(-1);
  const cycleDay = Math.floor(dayNumber(today) - dayNumber(latest)) + 1;
  if (cycleDay <= 5) {
    return {
      title: '最近记录了经期开始',
      detail: `最近一次记录是 ${latest}。每个人的感受都不一样，先问问她现在更想休息、喝点热的，还是需要你陪陪。`,
      message: `${opening}“今天想让我陪着你，还是帮你准备点什么？”`,
      estimate: null,
    };
  }

  const intervals = starts.slice(1).map((date, index) => dayNumber(date) - dayNumber(starts[index]));
  const recentIntervals = intervals.slice(-5);
  const average = recentIntervals.length ? Math.round(recentIntervals.reduce((sum, interval) => sum + interval, 0) / recentIntervals.length) : 0;
  const spread = recentIntervals.length ? Math.max(...recentIntervals) - Math.min(...recentIntervals) : Infinity;
  if (starts.length >= 3 && spread <= 7 && average >= 15 && average <= 60) {
    let expectedDay = dayNumber(latest) + average;
    while (expectedDay < dayNumber(today)) expectedDay += average;
    const daysUntil = Math.round(expectedDay - dayNumber(today));
    if (daysUntil <= 5) {
      const expectedDate = new Date(expectedDay * 86400000).toISOString().slice(0, 10);
      return {
        title: daysUntil === 0 ? '今天是记录推算的参考日期' : `记录推算约 ${daysUntil} 天后`,
        detail: `按最近 ${recentIntervals.length} 个周期的记录，下一次经期大约在 ${expectedDate} 前后。周期会变化，这只是生活安排参考。`,
        message: `${opening}“要不要提前准备一下你常用的用品？不需要的话也没关系。”`,
        estimate: expectedDate,
      };
    }
  }

  return {
    title: recentNote ? '记得先听听她自己的感受' : '给她留一点被惦记的温柔',
    detail: recentNote
      ? '最近有一条身体状态记录。记录只能帮忙回想，不代表她现在的感受；关心之前先问问她愿不愿意聊。'
      : '每个人的周期和感受都不同。比起猜测身体状态，一句不带预设的关心更贴心。',
    message: `${opening}“今天过得怎么样？想说说的话，我在听。”`,
    estimate: null,
  };
};
