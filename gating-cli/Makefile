# gating-cli
BUILDTIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')
VERSION := $(shell git rev-parse --short HEAD)

.PHONY: all test clean

all: build

build:
	@echo version: $(VERSION)
	go build -v -o bin/ .

clean:
	rm -f bin/*
