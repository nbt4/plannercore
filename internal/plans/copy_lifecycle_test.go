package plans

import (
	"crypto/sha256"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"plannercore/internal/lifecycle"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestCopyLocksCurrentMembershipAndRetainsAudit(t *testing.T) {
	dsn := os.Getenv("PLANNERCORE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("isolated _test PostgreSQL required")
	}
	u, err := url.Parse(dsn)
	if err != nil || !strings.HasSuffix(u.Path, "_test") {
		t.Fatal("dedicated _test database required")
	}
	namespace := fmt.Sprintf("planner_copy_%x", sha256.Sum256([]byte(t.Name())))[:32]
	query := u.Query()
	query.Set("search_path", namespace)
	u.RawQuery = query.Encode()
	db, err := gorm.Open(postgres.Open(u.String()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	exec := func(q string, args ...any) {
		t.Helper()
		if err := db.Exec(q, args...).Error; err != nil {
			t.Fatal(err)
		}
	}
	exec("CREATE SCHEMA " + namespace)
	t.Cleanup(func() { db.Exec("DROP SCHEMA " + namespace + " CASCADE"); sqlDB.Close() })
	for _, path := range []string{"../../migrations/postgresql/003_plannercore_schema.sql", "../../migrations/postgresql/004_task_recurrence.sql"} {
		raw, e := os.ReadFile(path)
		if e != nil {
			t.Fatal(e)
		}
		exec(string(raw))
	}
	exec(`CREATE TABLE users(userid INT PRIMARY KEY,is_active BOOL);INSERT INTO users VALUES(1,true)`)
	exec(`INSERT INTO planner_plans(id,name,created_by,created_at) VALUES(?,'Original','1','2020-01-01')`, uuid.Nil.String())
	exec(`INSERT INTO planner_members VALUES(?,'1','owner')`, uuid.Nil.String())
	if err = lifecycle.EnsureSchema(sqlDB); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db)
	tx, err := sqlDB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`DELETE FROM planner_members WHERE plan_id=$1`, uuid.Nil.String()); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	if err = repo.Copy(uuid.Nil.String(), uuid.NewString(), "1"); err == nil || time.Since(start) > time.Second {
		t.Fatal("copy did not reject in-flight revocation", err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err = repo.Copy(uuid.Nil.String(), uuid.NewString(), "1"); err == nil {
		t.Fatal("revoked member copied plan")
	}
	exec(`INSERT INTO planner_members VALUES(?,'1','owner')`, uuid.Nil.String())
	target := uuid.NewString()
	if err = repo.Copy(uuid.Nil.String(), target, "1"); err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Table("planner_mutation_events").Where("entity_id=? AND user_id='1' AND origin='UI' AND operation='create'", target).Count(&count)
	// The explicit native copy operation is retained by the primary audit trigger.
	if count == 0 {
		db.Table("planner_mutation_events").Where("entity_id=? AND user_id='1' AND origin='UI' AND operation='copy'", target).Count(&count)
	}
	if count != 1 {
		t.Fatal("copy actor audit missing", count)
	}
	exec(`UPDATE users SET is_active=false WHERE userid=1`)
	if err = repo.Copy(uuid.Nil.String(), uuid.NewString(), "1"); err == nil {
		t.Fatal("inactive user copied plan")
	}
}
