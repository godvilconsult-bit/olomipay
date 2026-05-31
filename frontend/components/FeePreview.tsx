interface Props {
  grossAmount: number;
  asset:       string;
  fee:         number;
  net:         number;
}

export default function FeePreview({ grossAmount, asset, fee, net }: Props) {
  if (!grossAmount) return null;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-2 text-sm">
      <div className="flex justify-between text-slate-600 dark:text-slate-400">
        <span>You send</span>
        <span className="font-medium text-slate-900 dark:text-white">
          {grossAmount.toFixed(asset === 'XLM' ? 4 : 2)} {asset}
        </span>
      </div>
      <div className="flex justify-between text-slate-500 dark:text-slate-500">
        <span>Platform fee (1%)</span>
        <span className="text-amber-600 dark:text-amber-400">
          −{fee.toFixed(asset === 'XLM' ? 4 : 2)} {asset}
        </span>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-semibold">
        <span className="text-slate-700 dark:text-slate-200">Recipient gets</span>
        <span className="text-success text-base">
          {net.toFixed(asset === 'XLM' ? 4 : 2)} {asset}
        </span>
      </div>
    </div>
  );
}
