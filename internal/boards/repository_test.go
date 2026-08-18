package boards

import (
	"errors"
	"testing"

	"plannercore/internal/core"
)

func TestValidateBucketOrder(t *testing.T) {
	buckets := []core.Bucket{{ID: "todo"}, {ID: "doing"}, {ID: "done"}}
	tests := []struct {
		name    string
		ids     []string
		wantErr bool
	}{
		{name: "accepts complete reordered set", ids: []string{"done", "todo", "doing"}},
		{name: "rejects missing bucket", ids: []string{"todo", "doing"}, wantErr: true},
		{name: "rejects duplicate bucket", ids: []string{"todo", "todo", "done"}, wantErr: true},
		{name: "rejects bucket from another plan", ids: []string{"todo", "doing", "foreign"}, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateBucketOrder(buckets, tt.ids)
			if tt.wantErr && !errors.Is(err, ErrInvalidBucketOrder) {
				t.Fatalf("expected ErrInvalidBucketOrder, got %v", err)
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected valid order, got %v", err)
			}
		})
	}
}
