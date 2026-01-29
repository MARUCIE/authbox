FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod .
COPY go.sum .
COPY cmd ./cmd
COPY internal ./internal
RUN go mod download
RUN CGO_ENABLED=0 go build -o /out/auth-box-api ./cmd/api

FROM alpine:3.19
RUN adduser -D -g '' app
USER app
COPY --from=build /out/auth-box-api /usr/local/bin/auth-box-api
EXPOSE 8080
ENV AUTH_BOX_HTTP_ADDR=:8080
CMD ["auth-box-api"]
