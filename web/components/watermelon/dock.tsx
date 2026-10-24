'use client';

/**
 * Watermelon UI dock (dock-base), adapted for GovFlow: each item is a route with a label, the
 * active page gets the dot, and groups are separated by thin dividers. Spring motion is unchanged.
 */

import React, { type FC } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, type Transition } from 'motion/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface DockItem {
  id: string;
  label: string;
  href: string;
  Icon: React.ElementType;
}

interface DockProps {
  groups: DockItem[][];
}

const dockSpring: Transition = {
  stiffness: 300,
  damping: 22,
  mass: 0.7,
};

export const Dock: FC<DockProps> = ({ groups }) => {
  const path = usePathname();
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <div className="flex w-full flex-col items-center justify-center bg-transparent font-sans">
      <motion.nav
        layout
        transition={dockSpring}
        aria-label="Main"
        className="glass relative flex items-end gap-2 rounded-xl px-3 py-2 sm:gap-3"
      >
        {groups.map((items, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 ? <span aria-hidden className="mx-0.5 h-8 w-px self-center bg-border" /> : null}
            {items.map((item) => {
              const active = isActive(item.href);
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <motion.div
                      className="relative"
                      style={{ transformOrigin: 'bottom' }}
                      whileHover={{ y: -5, scale: 1.12 }}
                      whileTap={{ scale: 1.25, y: -7 }}
                      transition={{ type: 'spring', stiffness: 550, damping: 15, mass: 1.1 }}
                    >
                      <Link
                        href={item.href}
                        aria-label={item.label}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'grid size-10 place-items-center rounded-2xl transition-colors',
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/70 text-muted-foreground hover:bg-background hover:text-foreground',
                        )}
                      >
                        <item.Icon className="size-[18px]" />
                      </Link>
                      <span
                        aria-hidden
                        className={cn(
                          'absolute -bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-sun transition-opacity duration-300',
                          active ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={10}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </React.Fragment>
        ))}
      </motion.nav>
    </div>
  );
};
