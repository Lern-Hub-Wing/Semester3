/**
 * Welche Ausgabe wird gebaut?
 *  – „site“ (Standard): die bisherige private StudySpace-Seite ohne Anmeldung
 *  – „app“: die neue kommerzielle App mit Konten, Lerngruppen und Plus
 * Vite ersetzt den Wert beim Bauen; nicht benötigter Code entfällt.
 */
export const IS_APP = import.meta.env.VITE_EDITION === 'app';
