interface Props {
  grossAmount: number;
  asset:       string;
  fee:         number;
  net:         number;
  tzsRate?:    number;  // optional TZS conversion rate
}

export default function FeePreview({ grossAmount, asset, fee, net, tzsRate = 2600 }: Props) {
  if (!grossAmount) return null;

  const dp  = asset === 'XLM' ? 4 : 2;
  const tzs = (n: number) => (n * tzsRate).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const isUsdc = asset === 'USDC';

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
      {/* Header */}
      <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Transaction Breakdown</p>
      </div>

      <div className="bg-white dark:bg-slate-900 px-4 py-3 space-y-2.5">
        {/* Amount you send */}
        <div className="flex justify-between">
          <span className="text-slate-500">Amount you send</span>
          <div className="text-right">
            <p className="font-semibold">{grossAmount.toFixed(dp)} {asset}</p>
            {isUsdc && <p className="text-xs text-slate-400">≈ TZS {tzs(grossAmount)}</p>}
          </div>
        </div>

        {/* OlomiPay fee */}
        <div className="flex justify-between">
          <div>
            <span className="text-slate-500">OlomiPay fee</span>
            <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">1%</span>
          </div>
          <div className="text-right">
            <p className="font-semibold text-amber-600">− {fee.toFixed(dp)} {asset}</p>
            {isUsdc && <p className="text-xs text-slate-400">≈ TZS {tzs(fee)}</p>}
          </div>
        </div>

        {/* Network fee */}
        <div className="flex justify-between">
          <div>
            <span className="text-slate-500">Network fee</span>
          </div>
          <p className="font-semibold text-green-600">Free</p>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* Recipient gets */}
        <div className="flex justify-between">
          <span className="font-semibold">Recipient gets</span>
          <div className="text-right">
            <p className="font-bold text-green-600 text-base">{net.toFixed(dp)} {asset}</p>
            {isUsdc && <p className="text-xs text-slate-400">≈ TZS {tzs(net)}</p>}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 border-t border-slate-200 dark:border-slate-700">
        <p className="text-xs text-slate-400 text-center">
          OlomiPay charges 1% per transaction. No hidden fees.
        </p>
      </div>
    </div>
  );
}
