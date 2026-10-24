import {
  AnimatePresence,
  motion,
  MotionConfig,
  type Transition,
} from 'motion/react';

import { useState } from 'react';
import { X } from 'lucide-react';
import useMeasure from 'react-use-measure';

export interface Transaction {
  id: string;
  icon: React.ReactNode;
  name: string;
  category: string;
  amount: string;
  date: string;
  time: string;
  transactionId: string;
  paymentMethod: string;
  cardNumber: string;
  cardType: string;
}

const springConfig: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.6,
};

const opacityConfig: Transition = {
  duration: 0.4,
  ease: [0.19, 1, 0.22, 1],
};

export function TransactionList({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  const [ref, bounds] = useMeasure();

  const selected = transactions.find((t) => t.id === open) ?? null;

  return (
    <MotionConfig transition={springConfig}>
      <motion.div
        className="theme-injected bg-muted/50 border-border flex items-center justify-center overflow-hidden rounded-2xl border"
        animate={{ height: bounds.height > 0 ? bounds.height : 'auto' }}
      >
        <div className="w-full p-3" ref={ref}>
          <AnimatePresence mode="popLayout">
            {!open && (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={opacityConfig}
                className="flex w-full flex-col gap-3"
              >

                {transactions.map((item) => (
                  <TransactionItem
                    key={item.id}
                    data={item}
                    onClick={() => setOpen(item.id)}
                  />
                ))}

              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="popLayout">
            {selected && (
              <motion.div exit={{ opacity: 0,transition:{duration:0.1} }}>
                <TransactionItemExpanded
                  data={selected}
                  onClose={() => setOpen(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </MotionConfig>
  );
}

function TransactionItem({
  data,
  onClick,
}: {
  data: Transaction;
  onClick: () => void;
}) {
  return (
    <div className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-1 transition-colors hover:bg-background/60" onClick={onClick}>
      <motion.div
        className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl"
        layoutId={`icon-${data.id}`}
        layout="position"
      >
        <div className="flex items-center justify-center">
          {data.icon}
        </div>
      </motion.div>

      <div className="flex min-w-0 flex-1 flex-col justify-center text-xs">
        <motion.p
          className="text-foreground font-semibold"
          layoutId={`name-${data.id}`}
          layout="position"
        >
          {data.name}
        </motion.p>

        <motion.p
          className="text-muted-foreground"
          layoutId={`category-${data.id}`}
          layout="position"
        >
          {data.category}
        </motion.p>
      </div>

      <motion.p
        className="text-foreground flex shrink-0 items-center text-xs font-medium tabular-nums"
        layoutId={`amount-${data.id}`}
        layout="position"
      >
        {data.amount}
      </motion.p>
    </div>
  );
}

function TransactionItemExpanded({
  data,
  onClose,
}: {
  data: Transaction;
  onClose: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex justify-between">
        <motion.div
          className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl"
          layoutId={`icon-${data.id}`}
          layout="position"
        >
          {data.icon}
        </motion.div>

        <div
          className="bg-muted flex cursor-pointer items-center justify-center self-start rounded-full p-2"
          onClick={onClose}
        >
          <X className="text-foreground size-4" />
        </div>
      </div>

      <div className="flex justify-between">
        <div>
          <motion.p
            className="text-foreground font-semibold"
            layoutId={`name-${data.id}`}
            layout="position"
          >
            {data.name}
          </motion.p>

          <motion.p
            className="text-muted-foreground text-sm"
            layoutId={`category-${data.id}`}
            layout="position"
          >
            {data.category}
          </motion.p>
        </div>

        <motion.p
          layoutId={`amount-${data.id}`}
          className="text-foreground"
          layout="position"
        >
          {data.amount}
        </motion.p>
      </div>

      <motion.div
        className="flex flex-col gap-2 text-xs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          ...opacityConfig,
          delay: 0.1,
        }}
      >
        <div className="border-border border border-dashed" />

        <p className="text-muted-foreground font-mono text-xs">{data.transactionId}</p>

        <p className="text-muted-foreground">{data.date}</p>

        <p className="text-muted-foreground">{data.time}</p>

        <div className="border-border border border-dashed" />

        <p className="text-muted-foreground">Paid via {data.paymentMethod}</p>

        {/* GovFlow: cardNumber carries the destination wallet, cardType the verification state. */}
        <p className="text-muted-foreground">
          <span className="font-mono text-xs">{data.cardNumber}</span>{' '}
          <span className="text-foreground font-medium">{data.cardType}</span>
        </p>
      </motion.div>
    </div>
  );
}
