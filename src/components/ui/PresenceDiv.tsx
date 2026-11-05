import { forwardRef, type ComponentProps } from 'react';
import { motion, useIsPresent } from 'motion/react';

/**
 * motion.div für Menüs, Popover und Dialoge in <AnimatePresence>.
 * Während der Ausblend-Animation ist das Element sofort nicht mehr bedienbar
 * (inert) und für Screenreader verborgen – ein schon geschlossenes Menü kann
 * so nicht versehentlich angeklickt werden.
 */
export const PresenceDiv = forwardRef<HTMLDivElement, ComponentProps<typeof motion.div>>(function PresenceDiv({ style, ...rest }, ref) {
  const present = useIsPresent();
  return (
    <motion.div
      ref={ref}
      {...rest}
      inert={!present}
      {...(present ? {} : { 'aria-hidden': true })}
      style={present ? style : { ...style, pointerEvents: 'none' }}
    />
  );
});

/** Wie PresenceDiv, aber als statischer Container (z. B. Dialog-Hintergrund). */
export const PresenceContainer = forwardRef<HTMLDivElement, ComponentProps<'div'>>(function PresenceContainer({ style, ...rest }, ref) {
  const present = useIsPresent();
  return <div ref={ref} inert={!present} {...rest} {...(present ? {} : { 'aria-hidden': true })} style={present ? style : { ...style, pointerEvents: 'none' }} />;
});
