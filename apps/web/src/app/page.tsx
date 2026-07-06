import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <section className={styles.intro} aria-labelledby="home-title">
        <p className={styles.eyebrow}>Convention management SaaS</p>
        <h1 id="home-title" className={styles.title}>
          vFurst
        </h1>
        <p className={styles.tagline}>Manage your event, not a spreadsheet.</p>
        <ul className={styles.status} aria-label="Foundation scope">
          <li className={styles.statusItem}>Next.js 15</li>
          <li className={styles.statusItem}>Astryx neutral theme</li>
          <li className={styles.statusItem}>Prisma foundation</li>
        </ul>
      </section>
    </main>
  );
}
