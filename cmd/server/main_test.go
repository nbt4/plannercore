package main

import (
	"reflect"
	"testing"
)

func TestCorsAllowedOrigins(t *testing.T) {
	want := []string{
		"http://localhost:3003",
		"http://localhost:3000",
		"http://localhost:8080",
		"https://cores.tsunami-events.de",
		"https://planner.tsunami-events.de",
	}
	got := corsAllowedOrigins(
		"https://cores.tsunami-events.de/suite",
		"https://planner.tsunami-events.de, javascript:alert(1), https://cores.tsunami-events.de/duplicate",
	)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("corsAllowedOrigins() = %#v, want %#v", got, want)
	}
}
