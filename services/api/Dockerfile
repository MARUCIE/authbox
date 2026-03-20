FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY migrations ./migrations
RUN CGO_ENABLED=0 go build -o /out/auth-box-api ./cmd/api

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
RUN adduser -D -g '' app
USER app
COPY --from=build /out/auth-box-api /usr/local/bin/auth-box-api
COPY --from=build /src/migrations /migrations
EXPOSE 8080
ENV AUTH_BOX_HTTP_ADDR=:8080
CMD ["sh", "-c", "auth-box-api --migrate-only --migrations-dir /migrations && auth-box-api --migrations-dir /migrations"]
